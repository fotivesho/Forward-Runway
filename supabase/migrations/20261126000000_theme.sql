-- Color theme preference, saved so it follows the user across devices.
alter table public.profiles
  add column theme text not null default 'system' check (theme in ('system', 'light', 'dark'));
