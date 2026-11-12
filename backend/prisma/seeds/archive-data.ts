import { names, type Tri } from './lib.ts';

/**
 * Сведения, переданные архивом 10.11.2026 (source/archive-data-2026-11-10/: «Контакты.docx»,
 * «Структура.docx», «История архива.docx», «Адреса и контакты филиалов.xls», лист «Книга»).
 * Переносятся как есть; ничего не дополняется. Известные ошибки источника не публикуются:
 * два адреса почты с опечаткой в домене (Глубоковский: alimvko, Зайсанский: akimvko.qov) оставлены пустыми
 * до подтверждения архивом; у филиала района Марқакөл телефон в источнике не указан.
 * Казахские и английские формы подготовлены командой и помечаются как машинный перевод; казахские названия филиалов
 * сверены с постановлением Восточно-Казахстанского областного акимата от 2 июня 2026 года № 142.
 */

export const ARCHIVE_DATA_DATE = new Date('2026-11-10');

export interface SettlementData {
  slug: string;
  current: Tri<{ name: string }>;
}

/** Населённые пункты филиалов, которых не было в данных старого сайта. */
export const ARCHIVE_SETTLEMENTS: SettlementData[] = [
  { slug: 'glubokoe', current: names('Глубокое', 'Глубокое', 'Glubokoye') },
  { slug: 'katon-karagay', current: names('Катон-Карагай', 'Катонқарағай', 'Katonkaragay') },
  { slug: 'kurchum', current: names('Курчум', 'Күршім', 'Kurshim') },
  { slug: 'markakol', current: names('Маркаколь', 'Марқакөл', 'Markakol') },
  { slug: 'samar', current: names('Самар', 'Самар', 'Samar') },
  { slug: 'akzhar', current: names('Акжар', 'Ақжар', 'Akzhar') },
  { slug: 'kasym-kaisenov', current: names('Касыма Кайсенова', 'Қасым Қайсенов', 'Kasym Kaisenov') },
  { slug: 'ulken-naryn', current: names('Улкен Нарын', 'Үлкен Нарын', 'Ulken Naryn') },
  { slug: 'shemonaikha', current: names('Шемонаиха', 'Шемонаиха', 'Shemonaikha') },
];

export interface ArchiveBranchData {
  slug: string;
  settlement: string;
  /** Адрес из источника; на всех языках показывается в исходной записи. */
  address: string;
  phone?: string;
  email?: string;
  director: string;
  names: Tri<{ fullName: string; shortName: string }>;
}

const n = (ru: string, kk: string, en: string, shortRu: string, shortKk: string, shortEn: string): ArchiveBranchData['names'] => ({
  ru: { fullName: ru, shortName: shortRu },
  kk: { fullName: kk, shortName: shortKk },
  en: { fullName: en, shortName: shortEn },
});

/** Филиалы КГУ «Государственный архив ВКО» в порядке списка архива. */
export const ARCHIVE_BRANCHES: ArchiveBranchData[] = [
  {
    slug: 'altai', settlement: 'altai', address: 'ВКО, район Алтай, ул. М. Горького, 33',
    phone: '8 (72335) 41630', email: 'sa.seilkhanov@akimvko.gov.kz', director: 'Сейлханов Сабырбек Какенович',
    names: n('Филиал района Алтай', 'Алтай аудандық филиалы', 'Altai District Branch', 'Алтай', 'Алтай', 'Altai'),
  },
  {
    slug: 'glubokoe', settlement: 'glubokoe', address: 'ВКО, Глубоковский район, п. Глубокое, ул. Пирогова, 6',
    phone: '8 (72331) 22878', director: 'Төлеу Бақдәулет Ибрахымұлы',
    names: n('Глубоковский районный филиал', 'Глубокое аудандық филиалы', 'Glubokoye District Branch', 'Глубокое', 'Глубокое', 'Glubokoye'),
  },
  {
    slug: 'zaisan', settlement: 'zaisan', address: 'ВКО, Зайсанский район, с. Зайсан, ул. Д. А. Конаева, 52',
    phone: '8 (72340) 21476', director: 'Козлов Виктор Николаевич',
    names: n('Зайсанский районный филиал', 'Зайсан аудандық филиалы', 'Zaisan District Branch', 'Зайсан', 'Зайсан', 'Zaisan'),
  },
  {
    slug: 'katon-karagay', settlement: 'katon-karagay', address: 'ВКО, Катон-Карагайский район, с. Катон-Карагай, ул. Жампеисова, 19/1',
    phone: '8 (72342) 29007', email: 'a.ziasheva1@akimvko.gov.kz', director: 'Зияшева Асель Тлеухановна',
    names: n('Катон-Карагайский районный филиал', 'Катонқарағай аудандық филиалы', 'Katonkaragay District Branch', 'Катон-Карагай', 'Катонқарағай', 'Katonkaragay'),
  },
  {
    slug: 'kurchum', settlement: 'kurchum', address: 'ВКО, Курчумский район, с. Курчум, ул. Барак Батыра, 25',
    phone: '8 (72339) 33104', email: 'kabdualieva.s@akimvko.gov.kz', director: 'Кабдуалиева Сандугаш Алтаевна',
    names: n('Курчумский районный филиал', 'Күршім аудандық филиалы', 'Kurshim District Branch', 'Курчум', 'Күршім', 'Kurshim'),
  },
  {
    slug: 'markakol', settlement: 'markakol', address: 'ВКО, район Марқакөл, с. Маркаколь, ул. Крахмаля, 67',
    email: 's.smagulov1@akimvko.gov.kz', director: 'Смагулов Самат Нурлыбекович',
    names: n('Филиал района Марқакөл', 'Марқакөл аудандық филиалы', 'Markakol District Branch', 'Марқакөл', 'Марқакөл', 'Markakol'),
  },
  {
    slug: 'ridder', settlement: 'ridder', address: 'ВКО, г. Риддер, ул. Ч. Уалиханова, 44',
    phone: '8 (72336) 42264', email: 'sh.sarsembinova@akimvko.gov.kz', director: 'Сарсембинова Шынар Жасулановна',
    names: n('Риддерский городской филиал', 'Риддер қалалық филиалы', 'Ridder City Branch', 'Риддер', 'Риддер', 'Ridder'),
  },
  {
    slug: 'samar', settlement: 'samar', address: 'ВКО, район Самар, с. Самар, ул. Горохова, 58',
    phone: '8 (72333) 31032', email: 'a.babataev@akimvko.gov.kz', director: 'Бабатаев Айдар Шамилевич',
    names: n('Филиал района Самар', 'Самар аудандық филиалы', 'Samar District Branch', 'Самар', 'Самар', 'Samar'),
  },
  {
    slug: 'tarbagatai', settlement: 'akzhar', address: 'ВКО, Тарбагатайский район, с. Акжар, ул. Даулетбая, 45',
    phone: '8 (72344) 21468', email: 'b.zhurekbaev@akimvko.gov.kz', director: 'Журекбаев Бауыржан Сеитказинович',
    names: n('Тарбагатайский районный филиал', 'Тарбағатай аудандық филиалы', 'Tarbagatai District Branch', 'Тарбагатай', 'Тарбағатай', 'Tarbagatai'),
  },
  {
    slug: 'ulan', settlement: 'kasym-kaisenov', address: 'ВКО, Уланский район, пос. Касыма Кайсенова, ул. З. Ахметова, 5, н. п. 5',
    phone: '8 (72338) 27120', email: 'a.abdrasulin@akimvko.gov.kz', director: 'Абдрасулин Аслан Оралович',
    names: n('Уланский районный филиал', 'Ұлан аудандық филиалы', 'Ulan District Branch', 'Улан', 'Ұлан', 'Ulan'),
  },
  {
    slug: 'ulken-naryn', settlement: 'ulken-naryn', address: 'ВКО, район Үлкен-Нарын, с. Улкен Нарын, ул. Огнева, 40',
    phone: '8 (72341) 21599', email: 'ba.ozhenov@akimvko.gov.kz', director: 'Оженов Бауржан Файзоллинович',
    names: n('Филиал района Үлкен Нарын', 'Үлкен Нарын аудандық филиалы', 'Ulken Naryn District Branch', 'Үлкен Нарын', 'Үлкен Нарын', 'Ulken Naryn'),
  },
  {
    slug: 'ust-kamenogorsk-personnel', settlement: 'ust-kamenogorsk', address: 'ВКО, г. Усть-Каменогорск, ул. Потанина, 12/2',
    phone: '8 (7232) 766560', email: 'g.bisenova@akimvko.gov.kz', director: 'Бисенова Гулсим Алдабергеновна',
    names: n(
      'Усть-Каменогорский городской филиал по личному составу', 'Жеке құрамы бойынша Өскемен қалалық филиалы', 'Oskemen City Personnel Records Branch',
      'Усть-Каменогорск, по личному составу', 'Өскемен, жеке құрам бойынша', 'Oskemen (personnel records)',
    ),
  },
  {
    slug: 'shemonaikha', settlement: 'shemonaikha', address: 'ВКО, Шемонаихинский район, г. Шемонаиха, ул. Жукова, здание 2, н. п. 4',
    phone: '8 (72332) 62358', email: 'n.kusataev@akimvko.gov.kz', director: 'Кусатаев Нуржан Тельманович',
    names: n('Шемонаихинский районный филиал', 'Шемонаиха аудандық филиалы', 'Shemonaikha District Branch', 'Шемонаиха', 'Шемонаиха', 'Shemonaikha'),
  },
];

/** Основной архив: «Контакты.docx». Телефон — приёмная. */
export const ARCHIVE_MAIN = {
  postalCode: '070000',
  phone: '8 (7232) 25-59-76',
  email: 'arhiv-ukg@yandex.kz',
  office: ['08:00', '17:00'] as [string, string],
  readingRoom: ['09:00', '16:00'] as [string, string],
  texts: {
    ru: {
      fullName: 'Государственный архив Восточно-Казахстанской области', shortName: 'ГА ВКО',
      address: 'г. Усть-Каменогорск, ул. Бейбітшілік, 26/1 (Головкова, 26/1)',
      scheduleText: 'Пн–пт, 8:00–17:00', readingRoomSchedule: 'Читальный зал: пн–пт, 9:00–16:00',
      description: 'КГУ «Государственный архив Восточно-Казахстанской области» управления цифровизации и архивов Восточно-Казахстанской области.',
    },
    kk: {
      fullName: 'Шығыс Қазақстан облысының мемлекеттік мұрағаты', shortName: 'ШҚО ММ',
      address: 'Өскемен қ., Бейбітшілік к-сі, 26/1 (Головков к-сі, 26/1)',
      scheduleText: 'Дс–жм, 8:00–17:00', readingRoomSchedule: 'Оқу залы: дс–жм, 9:00–16:00',
      description: 'Шығыс Қазақстан облысының цифрландыру және архивтер басқармасының «Шығыс Қазақстан облысының мемлекеттік архиві» КММ.',
    },
    en: {
      fullName: 'State Archive of East Kazakhstan Region', shortName: 'SA EKR',
      address: '26/1 Beibitshilik St (formerly Golovkov St), Oskemen',
      scheduleText: 'Mon–Fri, 8:00–17:00', readingRoomSchedule: 'Reading room: Mon–Fri, 9:00–16:00',
      description: 'Municipal state institution “State Archive of East Kazakhstan Region” of the Department of Digitalization and Archives of East Kazakhstan Region.',
    },
  } satisfies Tri<{ fullName: string; shortName: string; address: string; scheduleText: string; readingRoomSchedule: string; description: string }>,
};

export interface StaffData {
  fullName: string;
  phone?: string;
  email?: string;
  position: Tri<string>;
  department: Tri<string>;
}

const LEADERSHIP: Tri<string> = { ru: 'Руководство', kk: 'Басшылық', en: 'Management' };
const FIN_HR: Tri<string> = { ru: 'Отдел финансовой и кадровой работы', kk: 'Қаржы және кадр жұмысы бөлімі', en: 'Finance and Human Resources Department' };
const ADMIN: Tri<string> = { ru: 'Отдел административно-хозяйственной части', kk: 'Әкімшілік-шаруашылық бөлімі', en: 'Administration and Facilities Department' };
const SAFEKEEPING: Tri<string> = { ru: 'Отдел обеспечения сохранности и государственного учёта документов', kk: 'Құжаттардың сақталуын қамтамасыз ету және мемлекеттік есепке алу бөлімі', en: 'Document Preservation and State Registration Department' };
const ACQUISITION: Tri<string> = { ru: 'Отдел комплектования и контроля за ведомственными архивами', kk: 'Толықтыру және ведомстволық архивтерді бақылау бөлімі', en: 'Acquisition and Departmental Archives Oversight Department' };
const REFERENCE: Tri<string> = { ru: 'Отдел научно-справочного аппарата, публикации и научного использования документов', kk: 'Ғылыми-анықтамалық аппарат, құжаттарды жариялау және ғылыми пайдалану бөлімі', en: 'Finding Aids, Publication and Research Use Department' };
const IT: Tri<string> = { ru: 'Отдел информационных технологий', kk: 'Ақпараттық технологиялар бөлімі', en: 'Information Technology Department' };
const APPRAISAL: Tri<string> = { ru: 'Отдел экспертизы ценности документов', kk: 'Құжаттардың құндылығын сараптау бөлімі', en: 'Records Appraisal Department' };
const HEAD: Tri<string> = { ru: 'Руководитель отдела', kk: 'Бөлім басшысы', en: 'Head of department' };

/** «Структура.docx». Вакантная должность второго заместителя директора не публикуется. */
export const ARCHIVE_STAFF: StaffData[] = [
  { fullName: 'Жапаров Аскар Кенжебаевич', phone: '8 (7232) 25-13-22', email: 'ak.zhaparov@akimvko.gov.kz', position: { ru: 'Директор', kk: 'Директор', en: 'Director' }, department: LEADERSHIP },
  { fullName: 'Костина Елена Валерьевна', phone: '8 (7232) 57-00-15', email: 'e.kostina@akimvko.gov.kz', position: { ru: 'Заместитель директора', kk: 'Директордың орынбасары', en: 'Deputy Director' }, department: LEADERSHIP },
  { fullName: 'Калиева Мадина Саматовна', phone: '8 (7232) 70-31-06', position: { ru: 'Главный бухгалтер', kk: 'Бас бухгалтер', en: 'Chief Accountant' }, department: FIN_HR },
  { fullName: 'Увальжанова Кульмира Оспановна', phone: '8 (7232) 25-26-60', email: 'k.uvalzhanova@akimvko.gov.kz', position: { ru: 'Инспектор по кадрам', kk: 'Кадр жөніндегі инспектор', en: 'HR Inspector' }, department: FIN_HR },
  { fullName: 'Мутагалиев Аскат Кумаргалиевич', position: { ru: 'Специалист по административно-хозяйственной части', kk: 'Әкімшілік-шаруашылық бөлімінің маманы', en: 'Facilities Specialist' }, department: ADMIN },
  { fullName: 'Баелова Альмира Тугельбаевна', phone: '8 (7232) 25-43-10', email: 'a.baelova@akimvko.gov.kz', position: { ru: 'Главный хранитель фондов, руководитель отдела', kk: 'Қорлардың бас сақтаушысы, бөлім басшысы', en: 'Chief Custodian of Fonds, Head of department' }, department: SAFEKEEPING },
  { fullName: 'Сарсембаева Галия Еркеновна', phone: '8 (7232) 25-46-98', email: 'g.sarsembaeva@akimvko.gov.kz', position: HEAD, department: ACQUISITION },
  { fullName: 'Шустова Татьяна Владимировна', phone: '8 (7232) 25-59-76', email: 't.shustova@akimvko.gov.kz', position: HEAD, department: REFERENCE },
  { fullName: 'Бекниязқызы Жангуль', phone: '8 (7232) 25-01-85', email: 'zh.bekniazkyzy@akimvko.gov.kz', position: HEAD, department: IT },
  { fullName: 'Рахимбаева Акмарал Токтамысовна', phone: '8 (7232) 70-27-14', email: 'arhivvko_ekspertiza@yandex.kz', position: HEAD, department: APPRAISAL },
];

export const BRANCH_DIRECTOR: Tri<string> = { ru: 'Директор филиала', kk: 'Филиал директоры', en: 'Branch Director' };

export type SocialLink = {
  network: 'instagram' | 'facebook';
  label: string;
  url: string;
};

/** Ссылки на соцсети из «Контакты.docx»; ссылка-приглашение Instagram заменена на адрес профиля @arhiv_vko. */
export const ARCHIVE_SOCIAL: SocialLink[] = [
  { network: 'instagram', label: '@arhiv_vko', url: 'https://www.instagram.com/arhiv_vko/' },
  { network: 'facebook', label: 'vkoarhiv', url: 'https://www.facebook.com/vkoarhiv' },
];
