import { databaseDesignToPrisma, databaseDesignToSql } from './database-export';
import type { DatabaseDesign } from '@archivato/shared';

const design: DatabaseDesign = {
  sessionId: 's1',
  generatedAt: new Date().toISOString(),
  databaseType: 'PostgreSQL',
  entities: [
    {
      name: 'users',
      description: 'App users',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'string', nullable: false, unique: true },
        { name: 'created_at', type: 'timestamp', nullable: false },
        { name: 'role', type: 'enum', nullable: false },
      ],
    },
    {
      name: 'posts',
      description: 'Blog posts',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'title', type: 'string', nullable: false },
        { name: 'body', type: 'text', nullable: true },
        {
          name: 'author_id',
          type: 'uuid',
          nullable: false,
          references: { entity: 'users', column: 'id' },
        },
      ],
    },
  ],
  relations: [{ from: 'users', to: 'posts', type: 'one-to-many' }],
};

console.log('================ PRISMA ================');
console.log(databaseDesignToPrisma(design));
console.log('================ SQL ================');
console.log(databaseDesignToSql(design));
