import type { Tri } from './lib.ts';

/**
 * Справочные разделы из дополнения к ТЗ от 10.11.2026 (§2, §8, §9): государственная и платные услуги,
 * законодательство, читальный зал, государственные символы, полезные ссылки.
 * Реквизиты актов взяты из §8 дополнения; закон «О государственных услугах», закон «О противодействии коррупции»
 * (на него ссылается приказ архива о комплаенс-службе) и конституционный закон о символах — по официальным реквизитам.
 * Внешние ссылки — только на главные страницы официальных ресурсов, адреса которых известны точно; адреса,
 * которые архив не подтвердил (акимат ВКО, управление), не публикуются — блок «pending».
 * Текст написан командой: русский — reviewed, казахский и английский — machine.
 */

export type InfoBlock =
  | { type: 'p' | 'h' | 'pending'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'links'; items: Array<{ label: string; url: string; note?: string }> };

export type InfoPage = {
  key: string;
  actualizedAt: string;
  title: Tri<string>;
  lead: Tri<string>;
  blocks: Tri<InfoBlock[]>;
};

const ADILET = 'https://adilet.zan.kz';
const EGOV = 'https://egov.kz';
const EOTINISH = 'https://eotinish.kz';
const AKORDA = 'https://www.akorda.kz';
const DATE = '2026-11-10';

export const INFO_PAGES: InfoPage[] = [
  {
    key: 'services',
    actualizedAt: DATE,
    title: { ru: 'Государственная услуга', kk: 'Мемлекеттік көрсетілетін қызмет', en: 'Public service' },
    lead: {
      ru: 'Справочные сведения о государственной услуге архива. На этом сайте заявления не принимаются: их подают через портал электронного правительства или в канцелярии архива.',
      kk: 'Мұрағаттың мемлекеттік көрсетілетін қызметі туралы анықтамалық мәліметтер. Бұл сайтта өтініштер қабылданбайды: оларды электрондық үкімет порталы арқылы немесе мұрағат кеңсесінде береді.',
      en: 'Reference information about the archive’s public service. This website does not accept applications: they are submitted through the e-government portal or at the archive’s office.',
    },
    blocks: {
      ru: [
        { type: 'h', text: 'Какая услуга оказывается' },
        { type: 'p', text: 'Выдача архивных справок, копий архивных документов или архивных выписок.' },
        { type: 'h', text: 'Нормативная основа' },
        { type: 'links', items: [
          { label: 'Закон Республики Казахстан «О государственных услугах»', url: ADILET, note: 'от 15 апреля 2013 года № 88-V; текст — в ИПС «Әділет»' },
          { label: 'Правила оказания государственных услуг в области архивного дела', url: ADILET, note: 'приказ от 29 мая 2020 года № 159; текст — в ИПС «Әділет»' },
        ] },
        { type: 'h', text: 'Куда обращаться' },
        { type: 'links', items: [
          { label: 'Портал электронного правительства eGov.kz', url: EGOV, note: 'внешний ресурс: подача заявления на государственную услугу' },
          { label: 'Единая система обращений e-Otinish', url: EOTINISH, note: 'внешний ресурс: обращения в государственные органы' },
        ] },
        { type: 'p', text: 'Канцелярия архива: контакты на странице «Об архиве».' },
        { type: 'pending', text: 'Условия получения, перечень документов, сроки, стоимость и отчёты об оказанных услугах будут опубликованы после того, как архив передаст утверждённые сведения.' },
      ],
      kk: [
        { type: 'h', text: 'Қандай қызмет көрсетіледі' },
        { type: 'p', text: 'Архивтік анықтамаларды, архивтік құжаттардың көшірмелерін немесе архивтік үзінді көшірмелерді беру.' },
        { type: 'h', text: 'Нормативтік негіз' },
        { type: 'links', items: [
          { label: '«Мемлекеттік көрсетілетін қызметтер туралы» Қазақстан Республикасының Заңы', url: ADILET, note: '2013 жылғы 15 сәуірдегі № 88-V; мәтіні «Әділет» АҚЖ-да' },
          { label: 'Архив ісі саласындағы мемлекеттік қызметтерді көрсету қағидалары', url: ADILET, note: '2020 жылғы 29 мамырдағы № 159 бұйрық; мәтіні «Әділет» АҚЖ-да' },
        ] },
        { type: 'h', text: 'Қайда жүгінуге болады' },
        { type: 'links', items: [
          { label: 'eGov.kz электрондық үкімет порталы', url: EGOV, note: 'сыртқы ресурс: мемлекеттік қызметке өтініш беру' },
          { label: 'e-Otinish өтініштердің бірыңғай жүйесі', url: EOTINISH, note: 'сыртқы ресурс: мемлекеттік органдарға өтініштер' },
        ] },
        { type: 'p', text: 'Мұрағат кеңсесі: байланыс деректері «Мұрағат туралы» бетінде.' },
        { type: 'pending', text: 'Алу шарттары, құжаттар тізбесі, мерзімдері, құны және көрсетілген қызметтер туралы есептер мұрағат бекітілген мәліметтерді бергеннен кейін жарияланады.' },
      ],
      en: [
        { type: 'h', text: 'Which service is provided' },
        { type: 'p', text: 'Issuing archival certificates, copies of archival documents or archival extracts.' },
        { type: 'h', text: 'Legal basis' },
        { type: 'links', items: [
          { label: 'Law of the Republic of Kazakhstan “On Public Services”', url: ADILET, note: 'No. 88-V of 15 April 2013; text in the Adilet legal database' },
          { label: 'Rules for providing public services in archival affairs', url: ADILET, note: 'Order No. 159 of 29 May 2020; text in the Adilet legal database' },
        ] },
        { type: 'h', text: 'Where to apply' },
        { type: 'links', items: [
          { label: 'eGov.kz e-government portal', url: EGOV, note: 'external website: applications for public services' },
          { label: 'e-Otinish unified appeals system', url: EOTINISH, note: 'external website: appeals to government bodies' },
        ] },
        { type: 'p', text: 'Archive office: contacts on the “About the archive” page.' },
        { type: 'pending', text: 'Conditions, required documents, time limits, fees and reports on services provided will be published once the archive provides approved information.' },
      ],
    },
  },
  {
    key: 'services/paid',
    actualizedAt: DATE,
    title: { ru: 'Платные услуги', kk: 'Ақылы қызметтер', en: 'Paid services' },
    lead: {
      ru: 'Справочные сведения о платных услугах государственных архивов области. Сайт не оформляет заказы, не рассчитывает стоимость и не принимает оплату.',
      kk: 'Облыстың мемлекеттік мұрағаттарының ақылы қызметтері туралы анықтамалық мәліметтер. Сайт тапсырыс ресімдемейді, құнын есептемейді және төлем қабылдамайды.',
      en: 'Reference information about paid services of the region’s state archives. This website does not take orders, calculate fees or accept payments.',
    },
    blocks: {
      ru: [
        { type: 'h', text: 'Прейскурант' },
        { type: 'pending', text: 'Постановление «Об утверждении прейскуранта цен на товары (работы, услуги), реализуемые государственными архивами управления цифровизации и архивов Восточно-Казахстанской области» и действующий прейскурант будут опубликованы после того, как архив их передаст.' },
        { type: 'p', text: 'Уточнить порядок оказания платных услуг можно в канцелярии архива: контакты на странице «Об архиве».' },
      ],
      kk: [
        { type: 'h', text: 'Баға прейскуранты' },
        { type: 'pending', text: '«Шығыс Қазақстан облысының цифрландыру және архивтер басқармасының мемлекеттік архивтері өткізетін тауарларға (жұмыстарға, қызметтерге) баға прейскурантын бекіту туралы» қаулы және қолданыстағы прейскурант мұрағат оларды бергеннен кейін жарияланады.' },
        { type: 'p', text: 'Ақылы қызметтерді көрсету тәртібін мұрағат кеңсесінен нақтылауға болады: байланыс деректері «Мұрағат туралы» бетінде.' },
      ],
      en: [
        { type: 'h', text: 'Price list' },
        { type: 'pending', text: 'The resolution approving the price list for goods (works, services) sold by the state archives of the Department of Digitalization and Archives of East Kazakhstan Region, and the current price list, will be published once the archive provides them.' },
        { type: 'p', text: 'You can ask about paid services at the archive office: contacts on the “About the archive” page.' },
      ],
    },
  },
  {
    key: 'legislation',
    actualizedAt: DATE,
    title: { ru: 'Законодательство', kk: 'Заңнама', en: 'Legislation' },
    lead: {
      ru: 'Нормативные правовые акты, на которых основана работа архива. Действующие редакции, изменения и дополнения публикуются в ИПС «Әділет».',
      kk: 'Мұрағат жұмысына негіз болатын нормативтік құқықтық актілер. Қолданыстағы редакциялар, өзгерістер мен толықтырулар «Әділет» АҚЖ-да жарияланады.',
      en: 'Legal acts underlying the archive’s work. Current versions, amendments and additions are published in the Adilet legal database.',
    },
    blocks: {
      ru: [
        { type: 'links', items: [
          { label: 'Закон Республики Казахстан «О Национальном архивном фонде и архивах»', url: ADILET, note: 'от 22 декабря 1998 года № 326-I' },
          { label: 'Правила комплектования, хранения, учёта и использования документов Национального архивного фонда', url: ADILET, note: 'приказ от 9 августа 2023 года № 215' },
          { label: 'Закон Республики Казахстан «О государственных услугах»', url: ADILET, note: 'от 15 апреля 2013 года № 88-V' },
          { label: 'Правила оказания государственных услуг в области архивного дела', url: ADILET, note: 'приказ от 29 мая 2020 года № 159' },
          { label: 'Закон Республики Казахстан «О персональных данных и их защите»', url: ADILET, note: 'от 21 мая 2013 года № 94-V' },
          { label: 'Закон Республики Казахстан «О противодействии коррупции»', url: ADILET, note: 'от 18 ноября 2015 года № 410-V' },
          { label: 'Единые требования в области информационно-коммуникационных технологий и обеспечения информационной безопасности', url: ADILET, note: 'постановление Правительства Республики Казахстан от 20 декабря 2016 года № 832' },
        ] },
        { type: 'p', text: 'Перечень составлен по дополнению к техническому заданию. Перед применением сверяйте действующую редакцию акта в ИПС «Әділет».' },
      ],
      kk: [
        { type: 'links', items: [
          { label: '«Ұлттық архив қоры және архивтер туралы» Қазақстан Республикасының Заңы', url: ADILET, note: '1998 жылғы 22 желтоқсандағы № 326-I' },
          { label: 'Ұлттық архив қоры құжаттарын толықтыру, сақтау, есепке алу және пайдалану қағидалары', url: ADILET, note: '2023 жылғы 9 тамыздағы № 215 бұйрық' },
          { label: '«Мемлекеттік көрсетілетін қызметтер туралы» Қазақстан Республикасының Заңы', url: ADILET, note: '2013 жылғы 15 сәуірдегі № 88-V' },
          { label: 'Архив ісі саласындағы мемлекеттік қызметтерді көрсету қағидалары', url: ADILET, note: '2020 жылғы 29 мамырдағы № 159 бұйрық' },
          { label: '«Дербес деректер және оларды қорғау туралы» Қазақстан Республикасының Заңы', url: ADILET, note: '2013 жылғы 21 мамырдағы № 94-V' },
          { label: '«Сыбайлас жемқорлыққа қарсы іс-қимыл туралы» Қазақстан Республикасының Заңы', url: ADILET, note: '2015 жылғы 18 қарашадағы № 410-V' },
          { label: 'Ақпараттық-коммуникациялық технологиялар және ақпараттық қауіпсіздікті қамтамасыз ету саласындағы бірыңғай талаптар', url: ADILET, note: 'Қазақстан Республикасы Үкіметінің 2016 жылғы 20 желтоқсандағы № 832 қаулысы' },
        ] },
        { type: 'p', text: 'Тізбе техникалық тапсырмаға толықтыру бойынша жасалды. Қолданар алдында актінің қолданыстағы редакциясын «Әділет» АҚЖ-дан тексеріңіз.' },
      ],
      en: [
        { type: 'links', items: [
          { label: 'Law of the Republic of Kazakhstan “On the National Archival Fund and Archives”', url: ADILET, note: 'No. 326-I of 22 December 1998' },
          { label: 'Rules for acquisition, storage, registration and use of National Archival Fund documents', url: ADILET, note: 'Order No. 215 of 9 August 2023' },
          { label: 'Law of the Republic of Kazakhstan “On Public Services”', url: ADILET, note: 'No. 88-V of 15 April 2013' },
          { label: 'Rules for providing public services in archival affairs', url: ADILET, note: 'Order No. 159 of 29 May 2020' },
          { label: 'Law of the Republic of Kazakhstan “On Personal Data and Their Protection”', url: ADILET, note: 'No. 94-V of 21 May 2013' },
          { label: 'Law of the Republic of Kazakhstan “On Combating Corruption”', url: ADILET, note: 'No. 410-V of 18 November 2015' },
          { label: 'Unified requirements for information and communication technologies and information security', url: ADILET, note: 'Government Resolution No. 832 of 20 December 2016' },
        ] },
        { type: 'p', text: 'The list follows the addendum to the technical specification. Check the current version of each act in the Adilet legal database before relying on it.' },
      ],
    },
  },
  {
    key: 'reading-room',
    actualizedAt: DATE,
    title: { ru: 'Читальный зал', kk: 'Оқу залы', en: 'Reading room' },
    lead: {
      ru: 'Как работает читальный зал архива. Записаться, заказать дела или подать заявление через сайт нельзя.',
      kk: 'Мұрағаттың оқу залы қалай жұмыс істейді. Сайт арқылы жазылуға, істерге тапсырыс беруге немесе өтініш беруге болмайды.',
      en: 'How the archive’s reading room works. You cannot book a visit, order files or submit an application through this website.',
    },
    blocks: {
      ru: [
        { type: 'h', text: 'Перед визитом' },
        { type: 'ul', items: [
          'Найдите документы в электронном каталоге и выпишите их шифры: фонд, опись, дело.',
          'Проверьте уровень доступа: документы с ограниченным доступом выдаются на условиях, указанных в карточке.',
        ] },
        { type: 'pending', text: 'Правила работы читального зала и действующий регламент будут опубликованы после того, как архив их передаст.' },
      ],
      kk: [
        { type: 'h', text: 'Келер алдында' },
        { type: 'ul', items: [
          'Электрондық каталогтан құжаттарды тауып, олардың шифрларын жазып алыңыз: қор, тізбе, іс.',
          'Қол жеткізу деңгейін тексеріңіз: қолжетімділігі шектеулі құжаттар карточкада көрсетілген шарттармен беріледі.',
        ] },
        { type: 'pending', text: 'Оқу залының жұмыс қағидалары мен қолданыстағы регламент мұрағат оларды бергеннен кейін жарияланады.' },
      ],
      en: [
        { type: 'h', text: 'Before your visit' },
        { type: 'ul', items: [
          'Find the documents in the electronic catalogue and note their reference codes: fond, inventory, file.',
          'Check the access level: restricted documents are issued on the conditions shown on the record.',
        ] },
        { type: 'pending', text: 'Reading room rules and the current regulations will be published once the archive provides them.' },
      ],
    },
  },
  {
    key: 'symbols',
    actualizedAt: DATE,
    title: { ru: 'Государственные символы', kk: 'Мемлекеттік рәміздер', en: 'State symbols' },
    lead: {
      ru: 'Государственные символы Республики Казахстан: Государственный Флаг, Государственный Герб и Государственный Гимн.',
      kk: 'Қазақстан Республикасының мемлекеттік рәміздері: Мемлекеттік Ту, Мемлекеттік Елтаңба және Мемлекеттік Гимн.',
      en: 'State symbols of the Republic of Kazakhstan: the State Flag, the State Emblem and the State Anthem.',
    },
    blocks: {
      ru: [
        { type: 'p', text: 'Описание государственных символов и порядок их использования установлены Конституционным законом Республики Казахстан «О государственных символах Республики Казахстан».' },
        { type: 'links', items: [
          { label: 'Конституционный закон «О государственных символах Республики Казахстан»', url: ADILET, note: 'от 4 июня 2007 года № 258-III; текст — в ИПС «Әділет»' },
          { label: 'Официальный сайт Президента Республики Казахстан', url: AKORDA, note: 'внешний ресурс: сведения о государственных символах' },
        ] },
      ],
      kk: [
        { type: 'p', text: 'Мемлекеттік рәміздердің сипаттамасы және оларды пайдалану тәртібі «Қазақстан Республикасының мемлекеттік рәміздері туралы» Қазақстан Республикасының Конституциялық заңымен белгіленген.' },
        { type: 'links', items: [
          { label: '«Қазақстан Республикасының мемлекеттік рәміздері туралы» Конституциялық заң', url: ADILET, note: '2007 жылғы 4 маусымдағы № 258-III; мәтіні «Әділет» АҚЖ-да' },
          { label: 'Қазақстан Республикасы Президентінің ресми сайты', url: AKORDA, note: 'сыртқы ресурс: мемлекеттік рәміздер туралы мәліметтер' },
        ] },
      ],
      en: [
        { type: 'p', text: 'The description of the state symbols and the rules for their use are set by the Constitutional Law of the Republic of Kazakhstan “On the State Symbols of the Republic of Kazakhstan”.' },
        { type: 'links', items: [
          { label: 'Constitutional Law “On the State Symbols of the Republic of Kazakhstan”', url: ADILET, note: 'No. 258-III of 4 June 2007; text in the Adilet legal database' },
          { label: 'Official website of the President of the Republic of Kazakhstan', url: AKORDA, note: 'external website: information on the state symbols' },
        ] },
      ],
    },
  },
  {
    key: 'links',
    actualizedAt: DATE,
    title: { ru: 'Полезные ссылки', kk: 'Пайдалы сілтемелер', en: 'Useful links' },
    lead: {
      ru: 'Проверенные официальные ресурсы. Все ссылки ведут на внешние сайты.',
      kk: 'Тексерілген ресми ресурстар. Барлық сілтемелер сыртқы сайттарға апарады.',
      en: 'Verified official resources. All links lead to external websites.',
    },
    blocks: {
      ru: [
        { type: 'links', items: [
          { label: 'Ақорда — официальный сайт Президента Республики Казахстан', url: AKORDA },
          { label: 'eGov.kz — портал электронного правительства', url: EGOV },
          { label: 'e-Otinish — единая система обращений', url: EOTINISH },
          { label: 'ИПС «Әділет» — нормативные правовые акты Республики Казахстан', url: ADILET },
        ] },
        { type: 'pending', text: 'Ссылки на сайты акимата Восточно-Казахстанской области, управления цифровизации и архивов и на открытые материалы о ветеранах Великой Отечественной войны будут добавлены после того, как архив подтвердит их адреса.' },
      ],
      kk: [
        { type: 'links', items: [
          { label: 'Ақорда — Қазақстан Республикасы Президентінің ресми сайты', url: AKORDA },
          { label: 'eGov.kz — электрондық үкімет порталы', url: EGOV },
          { label: 'e-Otinish — өтініштердің бірыңғай жүйесі', url: EOTINISH },
          { label: '«Әділет» АҚЖ — Қазақстан Республикасының нормативтік құқықтық актілері', url: ADILET },
        ] },
        { type: 'pending', text: 'Шығыс Қазақстан облысы әкімдігінің, цифрландыру және архивтер басқармасының сайттарына және Ұлы Отан соғысы ардагерлері туралы ашық материалдарға сілтемелер мұрағат олардың мекенжайларын растағаннан кейін қосылады.' },
      ],
      en: [
        { type: 'links', items: [
          { label: 'Akorda — official website of the President of the Republic of Kazakhstan', url: AKORDA },
          { label: 'eGov.kz — e-government portal', url: EGOV },
          { label: 'e-Otinish — unified appeals system', url: EOTINISH },
          { label: 'Adilet — legal acts of the Republic of Kazakhstan', url: ADILET },
        ] },
        { type: 'pending', text: 'Links to the websites of the East Kazakhstan Regional Akimat, the Department of Digitalization and Archives, and open materials about Great Patriotic War veterans will be added once the archive confirms their addresses.' },
      ],
    },
  },
];
