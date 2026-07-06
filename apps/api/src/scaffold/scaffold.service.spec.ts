import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExportService } from '../export/export.service';
import type { GithubConnectionService } from './github-connection.service';
import { ScaffoldService } from './scaffold.service';
import type { PushToGithubDto } from './dto/push-to-github.dto';

const bundle = {
  sessionId: 's1',
  generatedAt: 'now',
  idea: { idea: 'A todo app' },
  systemDesign: { architecture: 'monolith' },
  databaseDesign: {
    databaseType: 'PostgreSQL',
    entities: [
      {
        name: 'todos',
        description: '',
        columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
      },
    ],
    relations: [],
  },
  apiDesign: {
    modules: [
      { name: 'Todos', basePath: '/api/todos', endpoints: [] },
    ],
  },
};

function makeService(storedToken: string | null = null): {
  service: ScaffoldService;
  exporter: { bundle: jest.Mock };
  connection: { resolveToken: jest.Mock };
} {
  const exporter = { bundle: jest.fn().mockResolvedValue(bundle) };
  const connection = {
    resolveToken: jest.fn().mockResolvedValue(storedToken),
  };
  return {
    service: new ScaffoldService(
      exporter as unknown as ExportService,
      connection as unknown as GithubConnectionService,
    ),
    exporter,
    connection,
  };
}

const dto: PushToGithubDto = {
  token: 'ghp_exampletokenvalue12345',
  repoName: 'my-app',
  isPrivate: true,
};

function okJson(value: unknown) {
  return { ok: true, status: 200, json: async () => value, text: async () => '' };
}

describe('ScaffoldService.zip', () => {
  const realFetch = global.fetch;
  afterEach(() => (global.fetch = realFetch));

  it('produces a non-empty ZIP archive', async () => {
    const { service } = makeService();
    const buf = await service.zip('s1');
    expect(buf.length).toBeGreaterThan(0);
    // ZIP local-file-header magic bytes.
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});

/** The repo-creation response (auto_init'd, so it has a default branch). */
function repoResponse() {
  return okJson({
    full_name: 'me/my-app',
    html_url: 'https://github.com/me/my-app',
    owner: { login: 'me' },
    name: 'my-app',
    default_branch: 'main',
  });
}

/**
 * The happy-path GitHub call sequence: create repo → get base ref → create tree
 * → create commit → fast-forward ref.
 */
function successSequence(): jest.Mock {
  return jest
    .fn()
    .mockResolvedValueOnce(repoResponse())
    .mockResolvedValueOnce(okJson({ object: { sha: 'base1' } }))
    .mockResolvedValueOnce(okJson({ sha: 'tree1' }))
    .mockResolvedValueOnce(okJson({ sha: 'commit1' }))
    .mockResolvedValueOnce(okJson({ ref: 'refs/heads/main' }));
}

describe('ScaffoldService.pushToGithub', () => {
  const realFetch = global.fetch;
  afterEach(() => (global.fetch = realFetch));

  it('inits the repo, then commits the scaffold onto the default branch', async () => {
    const fetchMock = successSequence();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { service } = makeService();
    const result = await service.pushToGithub('s1', 'user1', dto);

    expect(result).toEqual({
      htmlUrl: 'https://github.com/me/my-app',
      repo: 'me/my-app',
      branch: 'main',
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[0][0]).toContain('/user/repos');
    expect(fetchMock.mock.calls[1][0]).toContain('/git/ref/heads/main');
    expect(fetchMock.mock.calls[2][0]).toContain('/git/trees');
    expect(fetchMock.mock.calls[3][0]).toContain('/git/commits');
    expect(fetchMock.mock.calls[4][0]).toContain('/git/refs/heads/main');

    // The repo is created initialized (so the Git Data API can build a tree).
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).auto_init).toBe(true);
    // The tree carries the scaffold files inline.
    const treeBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(
      treeBody.tree.some((t: { path: string }) => t.path === 'package.json'),
    ).toBe(true);
    // The commit is parented on the initial commit.
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).parents).toEqual(['base1']);
    // The ref is fast-forwarded (PATCH) to our commit.
    expect(fetchMock.mock.calls[4][1].method).toBe('PATCH');
  });

  it('maps a 422 (name taken) to a 409 Conflict', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'name already exists',
    }) as unknown as typeof fetch;

    const { service } = makeService();
    await expect(service.pushToGithub('s1', 'user1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps a 401 (bad token) to Unauthorized', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Bad credentials',
    }) as unknown as typeof fetch;

    const { service } = makeService();
    await expect(service.pushToGithub('s1', 'user1', dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('uses the stored OAuth token when no PAT is supplied', async () => {
    const fetchMock = successSequence();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { service, connection } = makeService('stored-oauth-token');
    // No token in the DTO → the stored connection token is resolved + used.
    const result = await service.pushToGithub('s1', 'user1', {
      repoName: 'my-app',
    });

    expect(connection.resolveToken).toHaveBeenCalledWith('user1');
    expect(result.repo).toBe('me/my-app');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer stored-oauth-token',
    );
  });

  it('rejects with 400 when neither a PAT nor a stored connection exists', async () => {
    const { service } = makeService(null);
    await expect(
      service.pushToGithub('s1', 'user1', { repoName: 'my-app' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retries a transient 404 (ref not provisioned yet) and then succeeds', async () => {
    const notReady = {
      ok: false,
      status: 404,
      text: async () => 'Not Found',
      json: async () => ({}),
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(repoResponse())
      // The base-ref GET 404s once (backend still provisioning) → retried.
      .mockResolvedValueOnce(notReady)
      .mockResolvedValueOnce(okJson({ object: { sha: 'base1' } }))
      .mockResolvedValueOnce(okJson({ sha: 'tree1' }))
      .mockResolvedValueOnce(okJson({ sha: 'commit1' }))
      .mockResolvedValueOnce(okJson({ ref: 'refs/heads/main' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { service } = makeService();
    const result = await service.pushToGithub('s1', 'user1', dto);

    expect(result.repo).toBe('me/my-app');
    // create + (ref 404 + ref ok) + tree + commit + patch = 6 calls.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('retries a transient network failure and then succeeds', async () => {
    const timeout = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
    });
    const fetchMock = jest
      .fn()
      // First attempt throws a connect timeout; the retry succeeds.
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(repoResponse())
      .mockResolvedValueOnce(okJson({ object: { sha: 'base1' } }))
      .mockResolvedValueOnce(okJson({ sha: 'tree1' }))
      .mockResolvedValueOnce(okJson({ sha: 'commit1' }))
      .mockResolvedValueOnce(okJson({ ref: 'refs/heads/main' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { service } = makeService();
    const result = await service.pushToGithub('s1', 'user1', dto);

    expect(result.repo).toBe('me/my-app');
    // 1 failed create + create + ref + tree + commit + patch = 6 calls.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
