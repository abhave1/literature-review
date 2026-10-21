# Supabase Google authentication

## Setup status — October 20, 2026

The user approved the cloud setup below, requested the name **Research Bot**, and
requested alerts for spending above $0. Deployment remains outside that approval.

- Google Cloud project **Research Bot** was created: `research-bot-512301`, project
  number `804004344758`, in `cat.study.asu@gmail.com`'s account. Its billing page
  explicitly confirms that **no billing account is linked**. No paid trial or
  billing activation was performed.
- Google OAuth **Research Bot** is configured with an external audience and the
  professor's email as support/contact address. The user approved the API Services
  User Data Policy. A Web OAuth client was created and its credentials saved only
  in Supabase's Google provider. Google is enabled; email sign-in is disabled.
  The OAuth app remains in Testing with the professor listed as a test user.
  The observed login request uses only `email profile`; Google's documented
  basic-identity exception allows these logins without test-user listing or the
  seven-day authorization limit. Bot grants still control application access.
  The app and cloud projects are named Research Bot. Google's account chooser
  currently displays the Supabase domain; showing the custom OAuth brand requires
  Google's separate branding verification/publication process.
- Supabase **Research Bot** is healthy on Free/Nano in Oregon (us-west-2), project
  ref `ybghfnfbqjqyylpidpto`. The user created it with their database password.
  The approved migration is applied: 11 owner grants, RLS enabled, authenticated
  SELECT only, and no anonymous table privileges. Production and localhost
  callback URLs below are configured, along with the production Site URL.
  A rollback-only SQL check under the actual `authenticated` database role passed:
  the owner's email sees 11 grants and an unapproved email sees zero.
- The existing Supabase **MxML** organization is **Free**; its dashboard says the
  **spend cap is enabled** and extra usage will not be charged. No plan change was
  made. Supabase's current cost-control feature has no configurable dollar-threshold
  notifications. Google budget alarms require a billing account, which this
  project deliberately does not have.
- An active hourly Codex monitor, `research-bot-spending-alert`, checks those two
  billing surfaces read-only and alerts in this chat if it observes charges or an
  upcoming invoice over US$0, a paid Supabase plan/spend-protection change, or a
  newly linked Google billing account. It also reports loss of monitoring access.
  It stays quiet while verified state is unchanged. This is a best-effort hourly
  monitor dependent on available authenticated access, not a provider-native or
  real-time billing alarm. Scope excludes the existing Vercel/ASU analysis services.
- `.env.local` contains the Supabase project URL and publishable key, is ignored
  by Git, and preserves existing environment variables. The user completed real
  Google login as `abhaveabhilash@gmail.com` and provided a screenshot of the
  authenticated workspace showing all 11 bots. The professor's login was not
  completed because Google requested account verification.
- No production deployment, Git push, or merge has been performed.
- At the user's explicit request, `abhaveabhilash@gmail.com` was also granted all
  11 bot variants, matching the professor's grants, for testing with their own
  Google account. The insert returned 11 newly created grant rows.
- The requested role migration `202610210002_roles.sql` is applied in Supabase.
  Abhave is linked by Auth UUID to `admin`; the professor has an unclaimed admin
  invitation. Live checks under the authenticated database role confirmed 11
  permissions for Abhave and zero for an unassigned UUID. PostgreSQL regression
  tests and all 36 HTTP auth checks passed with role-based authorization.

Billing references: [Supabase cost controls](https://supabase.com/docs/guides/platform/cost-control)
and [Google budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets).

## Behavior

The app uses Supabase's cookie-based PKCE OAuth flow. `/login` starts Google sign-in;
`/auth/callback` exchanges the code for a session. `proxy.ts` verifies sessions with
`getUser()` and checks the user's current role permissions before rendering each page.
Every functional API handler also validates the user and its resource-specific
grant before reading storage, running analysis, or writing shared data. Missing
configuration and failed access lookups deny access. Logout uses a same-origin POST.

Google sign-in alone does not grant bot access. Migration
`202610210003_user_bot_tags.sql` replaces the earlier role bundles with two roles
and individual bot tags. It is applied in Research Bot. Migration
`202610210004_role_uuid.sql` subsequently converted `roles.id` and
`user_roles.role_id` to UUIDs, preserved all assignments and effective bot access,
and updated the access view, bot catalog policy, and pending admin claim function.
Migration `202610210005_bot_group_uuids.sql` also converts bot/group primary keys
and their referencing columns to UUIDs. The effective-access view now exposes
UUID `bot_id` and readable `bot_key`; local app lookups use `bot_key`.
Migration `202610210006_projects.sql` consolidates the catalog into ICAP (2 bots),
MxML (6 bots), and CSCL (3 bots). `bots.project_id` is a required UUID FK to
`projects.id`. The old group catalog is retained in the private legacy schema.
Migrations `202610210007_project_permissions.sql` and
`202610210008_admin_access.sql` are applied. They add project membership, project
settings, per-user setting permissions, and admin-only management RPCs. The old
`bots.path` and `bots.internal_only` columns are removed and their previous values
preserved privately. Page routes and required bot permissions live in code in
`lib/auth/access.ts`. After the user's review and explicit approval, a live
permissions test temporarily changed only Abhave's role from admin to external.
Reloading `/admin` redirected to `/access-required`; directly opening the
management API returned `{"error":"Admin required"}`. The original admin role
was restored immediately, and `/admin` loaded again. No project assignments or
settings were changed. TypeScript and all four auth unit tests passed.

| Table | Purpose / relationships |
| --- | --- |
| `roles` | UUID `id` primary key (generated automatically); unique `name` is `admin` or `external`. |
| `user_roles` | One row per assigned user. `user_id` primary key/FK to `auth.users.id`; UUID `role_id` FK to `roles.id`. |
| `projects` | UUID `id` primary key; unique name: ICAP, MxML, or CSCL. |
| `bots` | UUID `id` primary key, UUID `project_id` FK to `projects.id`, readable unique permission `key`, and name. No paths. |
| `user_projects` | Composite PK `(user_id, project_id)` with FKs to the assigned user and project. |
| `user_bot_grants` | Composite PK `(user_id, bot_id)`; composite FKs ensure bot and user membership belong to the same `project_id`. |
| `features` | UUID `id` PK; unique `code` identifies implemented behavior; `name` and `description` supply human-readable labels. |
| `project_features` | UUID `id` PK; `project_id` FK → projects; `feature_id` FK → features; unique `(project_id, feature_id)`; `enabled` switch. |
| `user_project_feature_permissions` | Composite PK `(user_id, project_feature_id)`; composite FKs constrain the feature assignment and user membership to the same project; `allowed` flag. |

**Migration status:** `202610210009_features.sql` is applied to Research Bot
Supabase after explicit approval. The isolated migration and permission tests
passed, including FKs, RLS, admin RPCs, feature disablement, and membership
revocation. A live before/after comparison confirmed every role, membership,
bot grant, project-feature assignment ID, enablement flag, and effective
permission was preserved. The old public settings tables are replaced by the
feature tables above. Localhost was checked with the school account: one
assigned bot, no prompt/permanent-upload capability, and no admin-page access.
No application deployment was performed.

`user_bot_access` remains the security-invoker view used by the proxy and API.
Admins receive every catalog bot without individual grant rows. External users
need project membership and an individual bot assignment. Removing membership
removes the corresponding bot grants and feature permissions. The
`user_feature_access` view resolves enabled project features: admins get
all enabled features; external users need explicit permission and can never
receive `prompt_access`. Project-wide disabled features take precedence.

The catalog initially contains **System prompts** (`prompt_access`) and
**Permanent PDF uploads** (`permanent_upload`). Codes are stable application
identifiers, not PKs or FKs. All relationships use UUIDs. Adding a catalog row
does not implement a new application capability: its behavior and enforcement
must also exist in code. The admin console's **Project features** section uses
catalog names/descriptions and controls project enablement; **People & access**
assigns project features to users.

All public tables have RLS. Authenticated clients can read catalog metadata and
only their own assignments; they cannot directly write assignments or features.
Anonymous clients have no privileges. `/admin`, `/api/admin/access`, and each
management RPC independently enforce admin access. Users appear after signing
in or after an admin uses **Add user**; assigning a first project gives an otherwise unassigned user the external
role. This UI cannot promote users to admin. The application admin role is
separate from Supabase dashboard access.

### Permission display and request flow

Bot identity consolidation (migration `202610210010_bot_identities.sql`) is
tested and applied to Research Bot Supabase after explicit approval.
The canonical catalog has eight bots: four MxML, one ICAP, and three CSCL.
Each bot is assigned once using its retained UUID. The admin UI also handles
older catalog snapshots by filtering the former route-variant entries.
`BOTS` defines canonical bots; `BOT_ROUTES` defines the eleven existing pages.
Internal routes require the admin role plus access to the canonical bot. They
appear as an additional link on the same workspace card, not another bot.
API authorization derives allowed routes from current canonical grants and
admin status, so granting the external bot never grants its internal route.
The migration archives the three unassigned internal variant records privately
before removing them from the public bot catalog, retaining all canonical IDs
and existing grants. It aborts if an unexpected variant assignment exists.
Local SQL tests and seven auth unit tests passed. Live before/after comparisons
confirmed all retained bot UUIDs, user grants, roles, project memberships, and
feature permissions were preserved. The school account still sees only its
assigned MxML4 Yes/No bot on localhost. No application deployment was performed.

The admin page displays role, project, bot, and feature tags for the selected
user/project. Tags summarize the assignments; the switches remain the editing
controls. Unsaved selections are explicitly labeled as a preview. Project
disablement and the admin-only prompt rule are reflected in feature tags.
The user workspace shows the user's effective features within each project.

The Supabase session cookie carries access/refresh tokens for authentication.
`proxy.ts` validates identity with `auth.getUser()` on protected requests and
checks current bot access or admin status for the relevant pages. API handlers
perform their own resource authorization. `getAccount()` validates identity,
then reads `user_bot_access`, `is_admin()`, and `user_feature_access` from
Supabase. Some handlers call these checks more than once within a request.
Application permissions are not embedded in custom JWT claims or accepted
from browser-supplied tags. There is no application permission cache across
requests: saved permission changes are enforced on subsequent requests,
without waiting for a JWT refresh. Already-rendered UI updates after a reload
or refetch; there is no realtime permission push.

### Adding users on localhost

The admin workspace includes an email form backed by `POST /api/admin/users`.
The endpoint verifies the caller's session and current admin role before using
the server-only Supabase Auth client. Existing emails select the existing user;
new emails create an unconfirmed account without a password or invitation email.
Google verifies email ownership when the person signs in. Creation itself grants
no role, project, bot, or setting permissions. Assign projects and bots afterward.
There is no new invitations table and this form cannot promote users to admin.

With the user's explicit approval, the existing Supabase service-role key was
saved in the Git-ignored `.env.local` as `SUPABASE_SERVICE_ROLE_KEY` with file mode
0600. It is imported only by a `server-only` module and has no `NEXT_PUBLIC_`
prefix. A read-only Auth lookup verified the credential. Production credential
configuration and deployment remain separate operations.

At the user's explicit request, `aabhilas@asu.edu` was created through the Add
user form, then assigned external role, MxML membership, and only the `mxml4`
(Yes/No external) bot through the admin UI. No setting permissions were granted.
The Gmail account was restored to admin. Real Google sign-in as the school
account succeeded: its workspace showed exactly one bot and `/mxml4` opened.
`/admin`, `/internal/mxml4`, and ICAP `/` redirected to `/access-required`; the
admin API returned `Admin required`. The capabilities endpoint returned false
for both prompt management and permanent uploads. No analysis or upload ran.

The old five tables are preserved in the private `research_bot_legacy` schema,
with client privileges revoked. There is no active public invitation table.
The existing verified-email trigger still consumes Yi's previously approved,
unclaimed admin invitation from the private schema once. It does not create new
invitations or automatically assign roles to other sign-ins. Abhave's existing
UUID/admin assignment was preserved; no external users or tags were seeded.

`/bots` lists only granted bots. Internal routes require sign-in too, in accordance
with the request to gate the entire app.

| Bot routing key (`bots.key`) | Page |
| --- | --- |
| `icap` | `/` |
| `icap-internal` | `/internal` |
| `mxml1` | `/mxml1` (`/mxml` redirects here) |
| `screening` | `/screening` |
| `mxml4` | `/mxml4` |
| `mxml4-internal` | `/internal/mxml4` |
| `mxml4-open` | `/mxml4-open` |
| `mxml4-open-internal` | `/internal/mxml4-open` |
| `cscl-screening` | `/metadata-screening-cscl-prototype` |
| `cscl-close` | `/fulltext-analysis-close-ended-cscl-prototype` |
| `cscl-open` | `/fulltext-analysis-open-ended-cscl-prototype` |

Permanent PDF uploads require the enabled `permanent_upload` project setting
and an individual permission for external users. Users without it can use
temporary in-browser uploads. The server checks this permission on every write.

Internal and external versions have distinct routes and internal prompt config
paths. Until an internal prompt is first saved, it reads the existing external
configuration so current behavior is preserved. External users can adjust rated
aspects/rubrics but cannot read, save, reset, or override system prompts through
the application. System prompt defaults are server-only modules; analysis loads
the configured template on the server. Admin prompt controls require the enabled
project setting. The preloaded PDF libraries remain shared.

Storage limitation: existing prompt persistence uses public Vercel Blob files.
App authorization does not make those URLs private. A private prompt-storage
migration and cleanup of old public copies are still required before claiming
confidentiality outside the app. No Blob credentials are present in this
checkout's `.env.local`, so the remote prompt-file inventory could not be checked.
Previously distributed PDF links also remain public.

## Approved cloud setup

1. Create `Research Bot` in the existing **MxML** Supabase organization
   (`yozgkcfameooiyendjli`) on the **Free** plan, Americas region. No paid upgrade.
   The owner must enter a new database password in the dashboard; it is not an app
   credential and must not be committed. Enable the Data API with manual grants.
2. Apply `supabase/migrations/202610210001_bot_access.sql` once to the new project.
   It creates only `public.bot_access`, enables RLS, grants read-only self-access,
   and seeds `cat.study.asu@gmail.com` for all eleven current bot variants.
   It does not modify existing PDF storage or analysis data.
3. In the professor's Google Cloud account, use/create a project named
   `Research Bot`, without activating billing or a paid trial. Configure a
   Google Auth Platform application with external audience, support/contact email
   `cat.study.asu@gmail.com`, and only `openid`, email, and profile identity scopes.
   Create a Web application OAuth client with this authorized redirect URI:
   `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`.
   This is the Supabase callback, not the Next.js callback.
4. Enable Google in Supabase Authentication → Sign In / Providers. Store the Google
   client ID and secret there. Keep the secret out of the repository and browser
   bundle. Disable unused authentication providers. Google signups must remain
   enabled so approved emails can sign in for the first time; the bot allowlist
   independently denies all unapproved accounts.
5. Set Supabase Site URL to `https://literature-review-five.vercel.app`. Add these
   redirect patterns (query strings carry the approved post-login page):
   - `https://literature-review-five.vercel.app/auth/callback**`
   - `http://localhost:3000/auth/callback**`
   Avoid whole-domain wildcard redirects. Do not authorize arbitrary Vercel
   preview domains. Google's Testing restrictions exempt basic identity-only
   sign-in. If other OAuth scopes are introduced, revisit audience publishing,
   verification, and the test-user list before making them available.
6. Copy the project URL and **publishable** key into `.env.local` using `.env.example`.
   Test a real Google login for the owner, an approved external account, and an
   unapproved account. The local fixture tests cannot verify Google's consent
   screen, real OAuth credentials, redirect settings, or PostgreSQL RLS execution.

Production activation is a separate approved operation: add
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the existing
Vercel project, preserve its other environment variables, and deploy the reviewed
commit. Set the variables before building; Next.js embeds `NEXT_PUBLIC_*` values.
Do not deploy this change with missing Supabase configuration: it intentionally
blocks app access. Never merge without the user's explicit instruction.

## Granting an account

After the user signs in with Google and their access is approved, use Supabase:

1. Find the UUID in `roles` for the name `external`. Add the Authentication user UUID to `user_roles.user_id` and that role UUID to `user_roles.role_id`.
2. Add one `user_bot_grants` row per allowed bot. Select bot UUIDs from `bots.id`;
   project names organize bots; they do not grant project-wide access.
3. For an approved administrator, use the UUID of the role named `admin`; individual bot tags are not
   needed. Switching an admin to external leaves only their explicit external tags.

Changes take effect on the next server request without refreshing JWT claims.
No invitation email is sent and no separate account password is needed.

Migration 003 expects the reviewed admin-only state from migration 002 and stops
if researcher roles or invitations have been added. It preserves prior data in a
private schema rather than deleting it. Do not reapply migrations. The earlier
migration's setup requirements remain: migration 001, the eleven approved Abhave
email grants, then migration 002, followed by migration 003.

## Local verification

```sh
npm run test:auth
npm run build
npm run test:auth:http
npx tsc --noEmit
```

The HTTP test builds with local fixture credentials, then starts that production
build on localhost port 3197 (override with
`AUTH_TEST_PORT`) and a local Supabase protocol fixture, then shuts down both test
servers. It uses no real credentials or paid AI/storage operations. It covers page
gating, resource permissions, rejected uploads, invalid callbacks, PKCE initiation,
cross-origin requests, and redirect safety. Unit tests also exercise revoked
sessions, removed grants, missing config, and unavailable grant lookups.

`tests/roles.sql` covers the superseded migration-002 model only (not migration 003). It runs the first two migrations against an empty disposable PostgreSQL 16+
database with minimal Auth fixtures. It tests UUID/role foreign keys, RLS,
administrator/external/unapproved access, multi-role union, blocked self-promotion,
verified-email invitation claiming, and revocation surviving later sign-ins.
Never run this bootstrap test script against Supabase or an existing database.
After HTTP tests, run `npm run build` again before serving/deploying a production
build so the output contains the intended project's real public configuration.

The Next.js 16 dependency was updated because the previous pinned version had
known proxy-bypass advisories. Other existing dependency audit findings are outside
this auth change and remain to be reviewed separately.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs),
[Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google),
[Google audience and identity-only exception](https://support.google.com/cloud/answer/15549945),
[Google branding verification](https://support.google.com/cloud/answer/15549049),
[Next.js proxy-bypass advisory](https://github.com/vercel/next.js/security/advisories/GHSA-26hh-7cqf-hhc6).
