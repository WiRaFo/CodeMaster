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
    // Прейскурант — постановление акимата ВКО от 15.12.2023 № 289, сканы на русском и казахском переданы архивом 11.11.2026.
    // Выдержка ниже переписана со сканов дословно (номера пунктов указаны); валюта в документе не указана, архив подтвердил тенге 11.11.2026.
    key: 'services/paid',
    actualizedAt: '2026-11-11',
    title: { ru: 'Платные услуги', kk: 'Ақылы қызметтер', en: 'Paid services' },
    lead: {
      ru: 'Платные услуги государственных архивов области оказываются по прейскуранту, утверждённому областным акиматом. Сайт не оформляет заказы, не рассчитывает стоимость и не принимает оплату.',
      kk: 'Облыстың мемлекеттік мұрағаттарының ақылы қызметтері облыс әкімдігі бекіткен прейскурант бойынша көрсетіледі. Сайт тапсырыс ресімдемейді, құнын есептемейді және төлем қабылдамайды.',
      en: 'Paid services of the region’s state archives are provided under the price list approved by the regional akimat. This website does not take orders, calculate fees or accept payments.',
    },
    blocks: {
      ru: [
        { type: 'h', text: 'Прейскурант' },
        { type: 'p', text: 'Прейскурант утверждён постановлением Восточно-Казахстанского областного акимата от 15 декабря 2023 года № 289 «Об утверждении прейскуранта цен на товары (работы, услуги), реализуемые государственными архивами управления цифровизации и архивов Восточно-Казахстанской области».' },
        { type: 'links', items: [
          { label: 'Постановление № 289 с прейскурантом (на русском языке)', url: '/files/documents/preyskurant-289-2023-ru.pdf', note: 'скан, 15 страниц, 1,6 МБ' },
          { label: '№ 289 қаулы және прейскурант (на казахском языке)', url: '/files/documents/preyskurant-289-2023-kk.pdf', note: 'скан, 15 страниц, 1,6 МБ' },
        ] },
        { type: 'h', text: 'Разделы прейскуранта' },
        { type: 'ol', items: [
          'Проведение по заказам юридических лиц курсов и семинаров по обучению современным основам документирования и управления документацией, разработка номенклатур дел, инструкций по делопроизводству',
          'Упорядочение архивных документов',
          'Реставрация, ремонт документов, изготовление конвертов',
          'Депозитарное хранение архивных документов',
          'Организация и проведение по заказам (заявкам) физических и юридических лиц документальных выставок',
          'Выявление по заказам (заявкам) физических и юридических лиц информации генеалогического и тематического характера',
          'Издание и реализация методической литературы, сборников архивных документов, учебной и других публикаций',
          'Изготовление копий архивных документов',
        ] },
        { type: 'h', text: 'Запросы и копии документов: выдержка' },
        { type: 'p', text: 'Выдержка из разделов 6 и 8. Цены в тенге, как они указаны в столбце «Прейскурант»; полный перечень с единицами измерения — в документе.' },
        { type: 'ul', items: [
          'Научное консультирование пользователя по интересующей тематике (история вопроса, историческая эпоха или период, персоналии, генеалогические изыскания) — 3331,0 за 1 час (п. 6.1).',
          'Исполнение запросов тематического и генеалогического характера, просмотр дел — 2 030,4 за дело (п. 6.2.1).',
          'Изготовление дополнительных экземпляров архивной справки по просьбе заявителя — 833,0 за экземпляр (п. 6.6).',
          'Выдача дубликата или переоформление архивной справки — 833,0 за экземпляр (п. 6.7).',
          'Ксерокопия архивного документа без оборота, лист формата А4: документа до 1900 г. — 455,0; 1901–1917 гг. — 379,0; 1918–1945 гг. — 316,0; 1946–1990 гг. — 263,0; с 1991 г. до сегодняшнего дня — 219,0 (пп. 8.1.1.1.1–8.1.1.1.5).',
          'Цифровая копия документа формата А4 без оборота (JPEG и PDF в цвете, 300 dpi): документа XIX в. – 1930 г. — 507,0; документа 1931 г. – XXI в. — 452,0 за образ (пп. 8.3.1–8.3.2).',
          'Самостоятельное копирование пользователем своим телефоном, фотоаппаратом или планшетом без штативов и с выключенной вспышкой, в присутствии работника архива, документ формата А4: XVII–XVIII вв. — 318,0; XIX в. – 1945 г. — 265,0; 1946 г. – XXI в. — 221,0 за кадр (пп. 8.5.1–8.5.3).',
        ] },
        { type: 'p', text: 'Приведены цены копий документов формата А4; копии других форматов дороже: А3 — в 2 раза, А2 — в 3 раза.' },
        { type: 'h', text: 'Льготы и бесплатные запросы' },
        { type: 'ul', items: [
          'Участникам Великой Отечественной войны предоставляются льготы в размере 50% по оплате работ, связанных с использованием архивных документов и информационных услуг, не имеющих социально-правового характера (за исключением запросов генеалогического характера).',
          'Бесплатно исполняются тематические запросы местного исполнительного органа, государственных органов, судебных органов, прокуратур, связанных с исполнением ими своих функций.',
        ] },
        { type: 'p', text: 'Порядок оказания платных услуг можно уточнить в канцелярии архива: контакты на странице «Об архиве».' },
      ],
      kk: [
        { type: 'h', text: 'Баға прейскуранты' },
        { type: 'p', text: 'Прейскурант Шығыс Қазақстан облысы әкімдігінің 2023 жылғы 15 желтоқсандағы № 289 «Шығыс Қазақстан облысы цифрландыру және архивтер басқармасының мемлекеттік архивтері өткізетін тауарларға (жұмыстарға, көрсетілетін қызметтерге) баға прейскурантын бекіту туралы» қаулысымен бекітілген.' },
        { type: 'links', items: [
          { label: '№ 289 қаулы және прейскурант (қазақ тілінде)', url: '/files/documents/preyskurant-289-2023-kk.pdf', note: 'скан, 15 бет, 1,6 МБ' },
          { label: 'Постановление № 289 с прейскурантом (орыс тілінде)', url: '/files/documents/preyskurant-289-2023-ru.pdf', note: 'скан, 15 бет, 1,6 МБ' },
        ] },
        { type: 'h', text: 'Прейскурант бөлімдері' },
        { type: 'ol', items: [
          'Заңды тұлғалардың тапсырыстары бойынша құжаттау мен құжаттаманы басқарудың заманауи негіздерін оқыту бойынша курстар мен семинарлар өткізу, іс номенклатураларын, іс жүргізу жөніндегі нұсқаулықтарды әзірлеу',
          'Архивтік құжаттарды ретке келтіру',
          'Құжаттарды қалпына келтіру, жөндеу, конверттер жасау',
          'Архивтік құжаттарды депозитарлық сақтау',
          'Жеке және заңды тұлғалардың тапсырысы (сұранымдары) бойынша құжаттамалық көрмені ұйымдастырып өткізу',
          'Жеке және заңды тұлғалардың тапсырыстары (өтінімдері) бойынша генеалогиялық және тақырыптық сипаттағы ақпаратты анықтау',
          'Әдістемелік әдебиеттерді, архивтік құжаттар жинақтарын, оқу және басқа да жарияланымдарды басып шығару және іске асыру',
          'Архивтік құжаттардың көшірмелерін жасау',
        ] },
        { type: 'h', text: 'Сұраулар мен құжат көшірмелері: үзінді' },
        { type: 'p', text: '6 және 8 бөлімдерден үзінді. Бағалар теңгемен, «Прейскурант» бағанында көрсетілгендей берілген; толық тізбе мен өлшем бірліктері — құжатта.' },
        { type: 'ul', items: [
          'Пайдаланушыны қызықтырған тақырып бойынша ғылыми кеңес беру (сұрақтың тарихы, тарихи дәуір немесе кезең, есімнама, генеалогиялық іздестіру және басқа) — 1 сағат үшін 3331,0 (6.1-т.).',
          'Тақырыптық және генеалогиялық сипаттағы сұрауларды орындау, істерді қарау — іс үшін 2 030,4 (6.2.1-т.).',
          'Өтініш берушінің сұрауы бойынша архивтік анықтаманың қосымша даналарын жасау — дана үшін 833,0 (6.6-т.).',
          'Архивтік анықтаманың телнұсқасын беру немесе қайта ресімдеу — дана үшін 833,0 (6.7-т.).',
          'Артқы жағысыз архивтік құжаттың ксерокөшірмесі, А4 форматты парақ: 1900 ж. дейінгі құжат — 455,0; 1901–1917 жж. — 379,0; 1918–1945 жж. — 316,0; 1946–1990 жж. — 263,0; 1991 ж. бастап бүгінгі күнге дейін — 219,0 (8.1.1.1.1–8.1.1.1.5-тт.).',
          'Артқы жағысыз А4 форматтағы құжаттың цифрлық көшірмесі (түсті JPEG және PDF, 300 dpi): XIX ғ. – 1930 ж. құжат — 507,0; 1931 ж. – XXI ғ. құжат — 452,0, бейне үшін (8.3.1–8.3.2-тт.).',
          'Архив қызметкерінің қатысуымен пайдаланушының өз телефонымен, фотоаппаратымен немесе планшетімен штативсіз, жарқыл функциясы өшірілген күйде өз бетінше көшірме жасауы, А4 форматты құжат: XVII, XVIII ғғ. — 318,0; XIX ғ. – 1945 ж. — 265,0; 1946 ж. – XXI ғ. — 221,0, кадр үшін (8.5.1–8.5.3-тт.).',
        ] },
        { type: 'p', text: 'А4 форматты құжаттардың көшірмелерін жасау бағалары келтірілген; басқа форматтағы құжаттар көшірмелерінің құны еселене көбейтіледі: А3 — 2 есе, А2 — 3 есе.' },
        { type: 'h', text: 'Жеңілдіктер және тегін сұраулар' },
        { type: 'ul', items: [
          'Ұлы Отан соғысының қатысушыларына әлеуметтік-құқықтық сипаттағы емес (генеалогиялық сипаттағы сұрауларды қоспағанда) архивтік құжаттарын және ақпараттық қызметтерді пайдаланумен байланысты жұмыстардың ақысы 50% көлеміндей жеңілдік беріледі.',
          'Жергілікті атқарушы органдарының, мемлекеттік органдарының, сот органдарының, прокуратуралардың өздерінің міндеттерін орындаумен байланысты тақырыптық сұраулар тегін жасалады.',
        ] },
        { type: 'p', text: 'Ақылы қызметтерді көрсету тәртібін мұрағат кеңсесінен нақтылауға болады: байланыс деректері «Мұрағат туралы» бетінде.' },
      ],
      en: [
        { type: 'h', text: 'Price list' },
        { type: 'p', text: 'The price list was approved by Resolution No. 289 of the East Kazakhstan Regional Akimat of 15 December 2023 “On approval of the price list for goods (works, services) sold by the state archives of the Department of Digitalization and Archives of East Kazakhstan Region”. The official text is available in Russian and Kazakh.' },
        { type: 'links', items: [
          { label: 'Resolution No. 289 with the price list (in Russian)', url: '/files/documents/preyskurant-289-2023-ru.pdf', note: 'scan, 15 pages, 1.6 MB' },
          { label: 'Resolution No. 289 with the price list (in Kazakh)', url: '/files/documents/preyskurant-289-2023-kk.pdf', note: 'scan, 15 pages, 1.6 MB' },
        ] },
        { type: 'h', text: 'Sections of the price list' },
        { type: 'ol', items: [
          'Courses and seminars for legal entities on records management, development of file nomenclatures and record-keeping instructions',
          'Arrangement of archival documents',
          'Restoration and repair of documents, making envelopes',
          'Depository storage of archival documents',
          'Documentary exhibitions organized on request of individuals and legal entities',
          'Genealogical and thematic research on request of individuals and legal entities',
          'Publication of methodological literature, collections of archival documents, educational and other publications',
          'Copies of archival documents',
        ] },
        { type: 'h', text: 'Requests and copies: excerpt' },
        { type: 'p', text: 'Excerpt from sections 6 and 8. Prices are in tenge, as given in the “Price” column; the full list with units is in the document.' },
        { type: 'ul', items: [
          'Research consultation on a topic of interest (history of the question, historical period, persons, genealogical research) — 3331.0 per hour (item 6.1).',
          'Thematic and genealogical requests, review of files — 2,030.4 per file (item 6.2.1).',
          'Additional copies of an archival certificate at the applicant’s request — 833.0 per copy (item 6.6).',
          'Duplicate or reissue of an archival certificate — 833.0 per copy (item 6.7).',
          'Photocopy of an archival document, one side, A4 sheet: before 1900 — 455.0; 1901–1917 — 379.0; 1918–1945 — 316.0; 1946–1990 — 263.0; from 1991 to date — 219.0 (items 8.1.1.1.1–8.1.1.1.5).',
          'Digital copy of an A4 document, one side (colour JPEG and PDF, 300 dpi): 19th century – 1930 — 507.0; 1931 – 21st century — 452.0 per image (items 8.3.1–8.3.2).',
          'Copying by the user with their own phone, camera or tablet, without a tripod and with the flash off, in the presence of an archive employee, A4 document: 17th–18th centuries — 318.0; 19th century – 1945 — 265.0; 1946 – 21st century — 221.0 per frame (items 8.5.1–8.5.3).',
        ] },
        { type: 'p', text: 'Prices are for A4 copies; other formats cost more: A3 twice as much, A2 three times as much.' },
        { type: 'h', text: 'Discounts and free requests' },
        { type: 'ul', items: [
          'Participants of the Great Patriotic War receive a 50% discount on works related to the use of archival documents and information services that are not of a social and legal nature (except genealogical requests).',
          'Thematic requests of the local executive body, government bodies, courts and prosecutors related to their functions are fulfilled free of charge.',
        ] },
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
