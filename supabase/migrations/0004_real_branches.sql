-- Replace placeholder branches with Nippon Toyota's actual branch list.
delete from branches where code in ('MUM', 'PUN', 'DEL');

insert into branches (code, name) values
  ('CO01A', 'Nettoor'),
  ('CO01B', 'Kalamassery'),
  ('KY01A', 'Kayamkulam'),
  ('TI01A', 'Thrissur'),
  ('IR01A', 'Irinjalakuda'),
  ('MV01A', 'Muvattupuzha'),
  ('KT01A', 'Kottayam'),
  ('KT01B', 'Pala'),
  ('TL01A', 'Thiruvalla'),
  ('PH01A', 'Pathanamthitta'),
  ('TR01A', 'Kazhakootam'),
  ('TR01C', 'Enchakkal'),
  ('KL01A', 'Kollam');
