# RLS Policies (SQL)

Place SQL policy files here and commit them.
Conventions:
- One file per table: `<table>_policies.sql`
- Include: ENABLE RLS; policies for SELECT/INSERT/UPDATE/DELETE
- Avoid broad `USING (true)` policies in production.
