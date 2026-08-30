-- What an agent does when you ask it to "add billing plans and clean up". Two
-- columns, a type, an index gained, an index lost, and three rows moved — the
-- kind of change that is easy to approve and hard to read afterwards.

create type demo.plan_tier as enum ('free', 'pro', 'team');

alter table demo.users add column plan plan_tier not null default 'free';
alter table demo.users add column last_seen_at timestamptz;

create index users_lower_email_idx on demo.users (lower(email));
drop index demo.projects_owner_id_idx;

update demo.users set plan = 'pro' where email = 'grace@example.com';
insert into demo.users (email, name) values ('katherine@example.com', 'Katherine Johnson');
delete from demo.projects where name = 'bombe';
