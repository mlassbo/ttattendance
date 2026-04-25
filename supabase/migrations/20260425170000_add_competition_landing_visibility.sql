alter table competitions
  add column if not exists show_on_landing_page boolean;

update competitions
set show_on_landing_page = true
where show_on_landing_page is null;

alter table competitions
  alter column show_on_landing_page set default true;

alter table competitions
  alter column show_on_landing_page set not null;