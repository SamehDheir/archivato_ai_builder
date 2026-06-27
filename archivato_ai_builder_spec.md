Archivato AI Builder — Full Project Spec

1. Project Overview

We are building an AI-powered SaaS platform called:

Archivato AI Builder

Core Idea:
A system that transforms a raw business idea into a complete software system design using AI.

The platform does NOT just generate code or chat responses.
It acts as:
- Product Manager
- System Architect
- Business Analyst
- Software Designer

--------------------------------------------

2. Core User Flow

Step 1: User Input
User enters a project idea.

Example:
"I want to build a clinic management system with appointments, billing, doctors, and patient records."

Optional:
- Industry
- Scale (MVP / Startup / Enterprise)
- Preferred stack

--------------------------------------------

Step 2: AI Interview Loop (CRITICAL FEATURE)

AI enters structured interview instead of generating output immediately.

Goal:
Extract full requirements before design.

AI Behavior:

Phase A: Understanding
- What is the main goal?
- Who are the users?

Phase B: Business Logic
- How does the system work?
- Any approvals?

Phase C: Features
- Payments needed?
- Notifications?
- Reports?

Phase D: Scale
- Expected users?
- MVP or enterprise?

Phase E: Technical Preferences
- SQL or NoSQL?
- Monolith or microservices?

Rules:
- Must reach 90% requirement completeness
- Must not proceed before confirmation
- Must summarize requirements first

--------------------------------------------

Step 3: Requirement Document

Output:
- Functional Requirements
- Non-functional Requirements
- User Roles
- Business Rules
- Constraints
- Assumptions

Format: JSON structured

--------------------------------------------

Step 4: System Design

- Architecture type (monolith/microservices)
- Tech stack recommendation
- Service breakdown:
  - Auth
  - Users
  - Billing
  - Notifications

--------------------------------------------

Step 5: Database Design

Entities:
- users
- patients
- doctors
- appointments
- invoices

Includes:
- relations
- primary keys
- foreign keys

--------------------------------------------

Step 6: API Design

Endpoints per module:
- method
- request schema
- response schema
- status codes

--------------------------------------------

Step 7: Folder Structure

src/
  modules/
    auth/
    users/
    appointments/
    billing/
  shared/
  middleware/
  config/
  utils/

--------------------------------------------

Step 8: MVP Roadmap

Phase 1:
- Auth
- Basic CRUD

Phase 2:
- Business logic
- Notifications

Phase 3:
- Analytics
- Scaling

--------------------------------------------

Step 9: AI Review Engine

Outputs:
- Scalability score
- Security issues
- Missing features
- Performance risks
- Recommendations

--------------------------------------------

Step 10: Export System

Formats:
- PDF
- Markdown
- JSON
- OpenAPI
- GitHub structure

--------------------------------------------

AI Architecture Pipeline:

User Input → Intent Analysis → Interview Loop → Requirements → System Design → DB Design → API Design → Review → Export

--------------------------------------------

AI Agents:
- Product Analyst
- Requirement Engineer
- System Architect
- Database Designer
- API Designer
- Reviewer

--------------------------------------------

Goal:
This is NOT a chatbot.
It is an AI Software Architecture Generator.
