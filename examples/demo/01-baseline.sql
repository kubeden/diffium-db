-- The database before anyone touches it. Everything lives in a `demo` schema so
-- this file can be run again from scratch without taking anything else with it.

drop schema if exists demo cascade;
create schema demo;

create table demo.users (
  id         bigserial   primary key,
  email      text        not null unique,
  name       text,
  created_at timestamptz not null default now()
);

create table demo.projects (
  id         bigserial   primary key,
  owner_id   bigint      not null references demo.users (id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now()
);

create index projects_owner_id_idx on demo.projects (owner_id);

insert into demo.users (email, name) values
  ('ada@example.com',   'Ada Lovelace'),
  ('grace@example.com', 'Grace Hopper'),
  ('alan@example.com',  'Alan Turing');

insert into demo.projects (owner_id, name)
select u.id, p.name
from demo.users u
join (values ('ada@example.com',   'analytical-engine'),
             ('grace@example.com', 'compiler'),
             ('alan@example.com',  'bombe')) as p (email, name) on p.email = u.email;
