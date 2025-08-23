-- Example: enable RLS and allow row access for the authenticated user's profile
alter table if exists profiles enable row level security;

drop policy if exists "read_own_profile" on profiles;
create policy "read_own_profile"
on profiles for select
to authenticated
using (auth.uid() = user_id);
