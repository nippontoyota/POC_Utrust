alter table case_photos drop constraint case_photos_category_check;
alter table case_photos add constraint case_photos_category_check
  check (category in ('front','rear','left','right','interior_odometer','other','rc_book'));
alter table case_photos add constraint rc_book_never_broker_visible
  check (category <> 'rc_book' or not broker_visible);
alter table case_photos add constraint rc_book_must_be_image
  check (category <> 'rc_book' or mime_type like 'image/%');
create unique index one_rc_book_photo_per_case on case_photos(case_id)
  where category = 'rc_book';

-- Applies to new submissions, without invalidating already submitted cases.
create function require_case_submission_photos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from case_photos where case_id=new.id and category='rc_book') then
    raise exception 'An RC book photo is required before submitting for evaluation';
  end if;
  if (select count(*) from case_photos where case_id=new.id and category<>'rc_book') < 6 then
    raise exception 'At least 6 vehicle photos are required in addition to the RC book photo';
  end if;
  return new;
end $$;
create trigger cases_require_rc_book_before_evaluation
  before update of status on cases for each row
  when (old.status='draft' and new.status='pending_evaluation')
  execute function require_case_submission_photos();
revoke all on function require_case_submission_photos() from public,anon,authenticated;
