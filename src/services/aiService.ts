import type {
  ExtractedFields,
  EventType,
  Priority,
  Person,
  FamilyEvent,
  ScheduleItem,
  RelationshipHistoryItem,
  GiftHistoryItem,
  ScheduleConflict,
  AIAnalysis,
  Invitation,
} from '../types';
import { generateId } from '../utils/id';

// ─── OCR Text Parser ─────────────────────────────────────────────────────────
// Extracts structured fields from raw OCR text using regex and keyword matching

// ─── OCR Text Parser ─────────────────────────────────────────────────────────
// Extracts structured fields from raw OCR text using multi-pattern regex and NLP heuristics

export function parseOCRText(ocrText: string): ExtractedFields {
  console.log('[Extractor] Started');
  const text = ocrText.toLowerCase();
  const confidence: Record<string, number> = {};

  // Detect event type (Tamil + English)
  const eventType = detectEventType(ocrText) || detectEventType(text);
  confidence.eventType = eventType ? 0.90 : 0.35;

  // Extract date (Tamil parenthesized date, Tamil label, English formats)
  const rawDate = extractDate(ocrText);
  const validDate = rawDate && isValidDateString(rawDate) ? rawDate : undefined;
  confidence.date = validDate ? 0.90 : 0.25;

  // Extract time (Tamil morning/evening terms, English AM/PM)
  const rawTime = extractTime(ocrText);
  const validTime = rawTime && isValidTimeString(rawTime) ? rawTime : undefined;
  confidence.time = validTime ? 0.88 : 0.30;

  // Extract venue (Tamil இடம், திருமண மண்டபம், ஆலயம், மஹால், English Venue, Mandapam)
  const venueResult = extractVenue(ocrText);
  confidence.venue = venueResult ? 0.85 : 0.25;

  // Extract location / city (Tamil districts and towns + English cities)
  const locationResult = extractLocation(ocrText);
  confidence.location = locationResult ? 0.80 : 0.25;

  // Extract names (Tamil bride/groom, couple, hosts, English couple & hosts)
  const namesResult = extractNames(ocrText, eventType);
  const validMainPerson = namesResult.mainPerson && isValidPersonName(namesResult.mainPerson)
    ? namesResult.mainPerson
    : undefined;
  const validHostName = namesResult.hostName && isValidPersonName(namesResult.hostName)
    ? namesResult.hostName
    : undefined;

  confidence.mainPerson = validMainPerson ? 0.85 : 0.25;
  confidence.hostName = validHostName ? 0.75 : 0.20;

  // Generate title
  const title = generateTitle(eventType, validMainPerson || '');
  confidence.title = title ? 0.85 : 0.35;

  // Count detected fields for debug logging
  let fieldsCount = 0;
  if (eventType) fieldsCount++;
  if (validDate) fieldsCount++;
  if (validTime) fieldsCount++;
  if (validMainPerson) fieldsCount++;
  if (validHostName) fieldsCount++;
  if (venueResult) fieldsCount++;
  if (locationResult) fieldsCount++;
  console.log(`[Extractor] Fields detected: ${fieldsCount}`);

  return {
    eventType: eventType || 'other',
    title,
    mainPerson: validMainPerson,
    hostName: validHostName,
    date: validDate,
    time: validTime,
    venue: venueResult || undefined,
    location: locationResult,
    description: generateDescription(ocrText),
    confidence,
  };
}

export function detectEventType(text: string): EventType | null {
  const lower = text.toLowerCase();
  const patterns: [RegExp, EventType][] = [
    // Wedding: Tamil & English
    [/(?:wedding|marriage|vivah|kalyanam|thirumanam|muhurtham|muhurtam|bride|groom|weds|tie the knot|nuptial|nikah|walima|matthalam|mangalyam|திருமண|திருமணம்|அழைப்பிதழ்|சுபமுகூர்த்த|முகூர்த்த|மணமகள்|மணமகன்|மணமக்கள்|நல்விவாக|கல்யாண|மாங்கல்ய|திரு அருள் துணை)/i, 'wedding'],
    // Reception: Tamil & English
    [/(?:reception|sangeet|mehendi|haldi|cocktail|வரவேற்பு|வரவேற்பு நிகழ்ச்சி)/i, 'reception'],
    // Engagement: Tamil & English
    [/(?:engagement|betrothal|ring ceremony|nischayam|nischayathartham|roka|sagai|நிச்சயதார்த்த|நிச்சயதார்த்தம்|பரிசம்)/i, 'engagement'],
    // House warming: Tamil & English
    [/(?:house\s*warm|griha\s*pravesh|gruhapravesam|new\s*home|new\s*residence|vastu\s*puja|graha\s*pravesh|புதுமனை\s*புகுவிழா|புதுமனை|கிரகப்பிரவேச|கிரகப்பிரவேசம்|இல்லப்\s*புகுவிழா|வாஸ்து\s*பூஜை)/i, 'house_warming'],
    // Baby shower / naming: Tamil & English
    [/(?:baby\s*shower|seemantham|valaikappu|godh\s*bharai|cradling|namakaranam|naming\s*ceremony|வளைகாப்பு|சீமந்தம்|பெயர்\s*சூட்டு|தொட்டில்\s*விழா|காதுகுத்து)/i, 'baby_shower'],
    // Birthday / Milestones: Tamil & English
    [/(?:birthday|b'day|birth day|bday|turning\s+\d+|celebrat.*birthday|shashti\s*poorthi|sadhabishekam|பிறந்தநாள்|பிறந்த\s*நாள்|மணிவிழா|சஷ்டியப்தபூர்த்தி|சதாபிஷேகம்|பீமரதசாந்தி|கனகாபிஷேகம்)/i, 'birthday'],
    // Anniversary: Tamil & English
    [/(?:anniversary|silver jubilee|golden jubilee|திருமண\s*நாள்|ஆண்டு\s*விழா)/i, 'anniversary'],
    // Graduation: Tamil & English
    [/(?:graduation|convocation|commencement|பட்டமளிப்பு\s*விழா|பட்டம்\s*பெறுதல்)/i, 'graduation'],
    // Retirement: Tamil & English
    [/(?:retirement|farewell|superannuation|பணிநிறைவு|பணி\s*ஓய்வு|பாராட்டு\s*விழா)/i, 'retirement'],
    // Funeral / Memorial: Tamil & English
    [/(?:funeral|condolence|memorial|prayer\s*meeting|remembrance|shraddh|tribute|நினைவு\s*நாள்|இரங்கல்|நினைவஞ்சலி)/i, 'funeral'],
    // Business / Inauguration: Tamil & English
    [/(?:conference|seminar|launch|inaugur|summit|business|grand\s*opening|ribbon\s*cutting|annual\s*general\s*meeting|திறப்பு\s*விழா|துவக்க\s*விழா|ஆரம்ப\s*விழா)/i, 'business_event'],
    // Religious: Tamil & English
    [/(?:puja|pooja|havan|homam|temple|religious|upanayanam|thread\s*ceremony|poonal|kumbhabhishekam|bhajan|kirtan|aradhana|church|cathedral|baptism|mass|பூஜை|ஹோமம்|கும்பாபிஷேகம்|ஆலய\s*திருவிழா|பிரார்த்தனை|திருப்பலி|ஞானஸ்நானம்)/i, 'religious'],
    // Cultural: Tamil & English
    [/(?:cultural|dance|music|concert|arangetram|drama|carnatic|நாட்டியாஞ்சலி|இன்னிசை|கச்சேரி|அரங்கேற்றம்)/i, 'cultural'],
  ];

  for (const [pattern, type] of patterns) {
    if (pattern.test(text) || pattern.test(lower)) return type;
  }
  return null;
}

export function extractDate(rawText: string): string | null {
  const text = rawText.replace(/\r\n/g, ' ').replace(/\n/g, ' ');

  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04',
    jun: '06', jul: '07', aug: '08', sep: '09', sept: '09',
    oct: '10', nov: '11', dec: '12',
  };

  // Pattern 0: Explicit Tamil label with date: தேதி[:\s]*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})
  const tamilLabelMatch = text.match(/தேதி\s*[:\-]?\s*\(?(\d{1,2})[\/\-.](0?[1-9]|1[0-2])[\/\-.](20\d{2})\)?/);
  if (tamilLabelMatch) {
    const [, day, month, year] = tamilLabelMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Pattern 1: Parenthesized or delimited DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (e.g. (23.08.2026))
  const dmyMatch = text.match(/(?:^|[^\d])(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](20\d{2})(?:[^\d]|$)/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Pattern 2: ISO YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const isoMatch = text.match(/(?:^|[^\d])(20\d{2})[\/\-.](0?[1-9]|1[0-2])[\/\-.](0?[1-9]|[12]\d|3[01])(?:[^\d]|$)/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Pattern 3: Month DD, YYYY or Month DD YYYY (e.g. August 30, 2026 or Sept 15, 2026)
  const monthDayYearMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s*,?\s*(20\d{2})\b/i
  );
  if (monthDayYearMatch) {
    const monthKey = monthDayYearMatch[1].toLowerCase().replace('.', '');
    const monthNum = months[monthKey];
    if (monthNum) {
      return `${monthDayYearMatch[3]}-${monthNum}-${monthDayYearMatch[2].padStart(2, '0')}`;
    }
  }

  // Pattern 4: DD Month YYYY (e.g. 30th August 2026 or 15 September 2026 or 15th of Oct 2026)
  const dayMonthYearMatch = text.match(
    /\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?(?:\s+of)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*,?\s*(20\d{2})\b/i
  );
  if (dayMonthYearMatch) {
    const monthKey = dayMonthYearMatch[2].toLowerCase().replace('.', '');
    const monthNum = months[monthKey];
    if (monthNum) {
      return `${dayMonthYearMatch[3]}-${monthNum}-${dayMonthYearMatch[1].padStart(2, '0')}`;
    }
  }

  // Pattern 5: DD/MM/YY (2-digit year)
  const dmyShortYearMatch = text.match(/(?:^|[^\d])(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](\d{2})(?:[^\d]|$)/);
  if (dmyShortYearMatch) {
    const [, day, month, shortYear] = dmyShortYearMatch;
    const year = `20${shortYear}`;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

export function extractTime(rawText: string): string | null {
  const text = rawText.replace(/\r\n/g, ' ').replace(/\n/g, ' ');

  // 1. Tamil Time pattern: முற்பகல் / பிற்பகல் / காலை / மாலை / இரவு with HH.MM or HH:MM
  // e.g., "முற்பகல் 9.00 மணிக்கு மேல் 10.30 மணிக்குள்"
  const tamilTimeMatch = text.match(/(முற்பகல்|பிற்பகல்|காலை|மாலை|இரவு|விடியற்காலை|மதியம்)\s*(\d{1,2})[:.](\d{2})\s*(?:மணிக்கு|மணி)?/i);
  if (tamilTimeMatch) {
    const period = tamilTimeMatch[1];
    let hours = parseInt(tamilTimeMatch[2], 10);
    const minutes = tamilTimeMatch[3];
    const isPM = ['பிற்பகல்', 'மாலை', 'இரவு', 'மதியம்'].includes(period);

    if (isPM && hours < 12 && period !== 'மதியம்') hours += 12;
    if (period === 'மதியம்' && hours < 11) hours += 12;
    if (!isPM && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // 2. English / Contextual keywords WITH AM/PM
  const contextMatch = text.match(/(?:muhurtham|muhurtam|reception|timing|time|at)\s*[:\-]?\s*(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m|p\.m)/i);
  if (contextMatch) {
    let hours = parseInt(contextMatch[1], 10);
    const minutes = contextMatch[2];
    const meridiem = contextMatch[3]?.replace(/\./g, '').toLowerCase();

    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // 3. Time range pattern: 9:00 AM - 10:30 AM
  const rangeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m|p\.m)?\s*(?:to|-|–)\s*(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m|p\.m)/i);
  if (rangeMatch) {
    let hours = parseInt(rangeMatch[1], 10);
    const minutes = rangeMatch[2];
    const meridiem = (rangeMatch[3] || rangeMatch[6])?.replace(/\./g, '').toLowerCase();

    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // 4. Standard HH:MM AM/PM
  const timeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m|p\.m)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2];
    const meridiem = timeMatch[3]?.replace(/\./g, '').toLowerCase();

    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // 5. Tamil Time without period prefix: "நேரம்: 9.00 மணிக்கு" or "9.00 மணிக்கு மேல்"
  const tamilTimeSuffixMatch = text.match(/(?:நேரம்|timing|time|at)\s*[:\-]?\s*(\d{1,2})[:.](\d{2})\s*(?:மணிக்கு|மணி)?/i);
  if (tamilTimeSuffixMatch) {
    let hours = parseInt(tamilTimeSuffixMatch[1], 10);
    const minutes = tamilTimeSuffixMatch[2];
    if (hours < 7) hours += 12;
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // 6. Simple "6 PM" or "10 AM" style
  const simpleTimeMatch = text.match(/\b(\d{1,2})\s*(am|pm|a\.m|p\.m)\b/i);
  if (simpleTimeMatch) {
    let hours = parseInt(simpleTimeMatch[1], 10);
    const meridiem = simpleTimeMatch[2].replace(/\./g, '').toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:00`;
  }

  return null;
}

export function extractVenue(rawText: string): string | null {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const fullText = rawText.replace(/\r\n/g, ' ').replace(/\n/g, ' ');

  // 1. Explicit Tamil label: இடம்: ...
  const tamilVenueLabelMatch = fullText.match(/இடம்\s*[:\-]\s*([^\n,]+)/i);
  if (tamilVenueLabelMatch) {
    const cleaned = cleanVenueText(tamilVenueLabelMatch[1]);
    if (cleaned && cleaned.length > 3) return cleaned;
  }

  // 2. Tamil venue keywords in line: திருமண மண்டபம், மண்டபம், ஆலயம், கோயில், மஹால்
  for (const line of lines) {
    const match = line.match(/([A-Za-z0-9\u0B80-\u0BFF\s.'-]+?(?:திருமண\s*மண்டபம்|மண்டபம்|மஹால்|மகால்|ஆலயம்|கோயில்|கோவில்|இல்லம்|அரங்கம்|ஹால்))/i);
    if (match) {
      const cleaned = cleanVenueText(match[1]);
      if (cleaned && cleaned.length > 3) return cleaned;
    }
  }

  // 3. Fallback search across full text for Tamil venue with suffix (மண்டபத்தில், ஆலயத்தில்)
  const fullVenueMatch = fullText.match(/([A-Za-z0-9\u0B80-\u0BFF\s.'-]+?(?:திருமண\s*மண்டபத்தில்|ஆலயத்தில்))\s*(?:நடைபெற|வைத்து)/i);
  if (fullVenueMatch) {
    const v = fullVenueMatch[1]
      .replace(/திருமண\s*மண்டபத்தில்/g, 'திருமண மண்டபம்')
      .replace(/ஆலயத்தில்/g, 'ஆலயம்')
      .replace(/^(?:அருகில்|வைத்து|இங்கு)\s+/i, '');
    const cleaned = cleanVenueText(v);
    if (cleaned && cleaned.length > 3) return cleaned;
  }

  // 4. Explicit English Venue line: "Venue: ..."
  for (const line of lines) {
    const venueMatch = line.match(/(?:venue|place|location|held at)\s*[:\-]\s*(.+)$/i);
    if (venueMatch) {
      const cleaned = cleanVenueText(venueMatch[1]);
      if (cleaned) return cleaned;
    }
  }

  // 5. English venue keywords
  const venueKeywords = /(?:kalyana\s*mandapam|mandapam|mahal|convention\s*centre|convention\s*center|palace|hall|hotel|resort|auditorium|bhavan|banquet|gardens|lawn|grounds|cathedral|church|temple)/i;
  for (const line of lines) {
    if (venueKeywords.test(line)) {
      const cleaned = cleanVenueText(line.replace(/^(?:at\s+(?:the\s+)?)/i, ''));
      if (cleaned && cleaned.length > 4) return cleaned;
    }
  }

  // 6. Fallback inline regex across full text
  const inlineMatch = fullText.match(/at\s+(?:the\s+)?([A-Za-z0-9\s.,'&-]+?(?:hall|hotel|palace|mandapam|mahal|convention\s*centre|convention\s*center|resort|auditorium|bhavan|banquet|garden))/i);
  if (inlineMatch) {
    const cleaned = cleanVenueText(inlineMatch[1]);
    if (cleaned) return cleaned;
  }

  return null;
}

function cleanVenueText(text: string): string {
  return text
    .replace(/(?:dinner|lunch|breakfast|reception|muhurtham|rsvp|phone|contact|with best|நடைபெற|உள்ளது|வைத்து).*$/i, '')
    .replace(/^(?:at\s+|அருகில்\s+|இங்கு\s+)/i, '')
    .replace(/[,.\-\s]+$/, '')
    .trim();
}

export function extractLocation(rawText: string): string | undefined {
  const text = rawText.replace(/\r\n/g, ' ').replace(/\n/g, ' ');

  // 1. Explicit Tamil address label: முகவரி: ...
  const tamilAddressMatch = text.match(/(?:முகவரி|இடம்)\s*[:\-]\s*([^\n,]+)/i);
  if (tamilAddressMatch && tamilAddressMatch[1].trim().length > 3) {
    return tamilAddressMatch[1].trim();
  }

  // 2. Tamil cities, districts, and prominent towns
  const tamilLocations = [
    'சுங்கான்கடை', 'கன்னியாகுமரி', 'நாகர்கோவில்', 'சென்னை', 'மதுரை', 'கோயம்புத்தூர்',
    'திருச்சி', 'திருச்சிராப்பள்ளி', 'சேலம்', 'திருநெல்வேலி', 'ஈரோடு', 'வேலூர்',
    'தஞ்சாவூர்', 'திண்டுக்கல்', 'காஞ்சிபுரம்', 'திருப்பூர்', 'தூத்துக்குடி', 'புதுச்சேரி',
    'பாண்டிச்சேரி', 'பெங்களூரு', 'பெங்களூர்', 'மும்பை', 'தில்லி'
  ];

  for (const loc of tamilLocations) {
    if (text.includes(loc)) {
      if (loc === 'சுங்கான்கடை' && text.includes('கன்னியாகுமரி')) {
        return 'சுங்கான்கடை, கன்னியாகுமரி';
      }
      return loc;
    }
  }

  // 3. Explicit English location/address label
  const addressMatch = text.match(/(?:address|city|place)\s*[:\-]\s*([A-Za-z0-9\s,.-]+?)(?:(?=phone|rsvp|dinner|lunch|date|time)|$)/i);
  if (addressMatch && addressMatch[1].trim().length > 3) {
    return addressMatch[1].trim();
  }

  // 4. English city name search
  const cities = [
    'Chennai', 'Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'New Delhi',
    'Hyderabad', 'Kolkata', 'Pune', 'Coimbatore', 'Madurai', 'Trichy',
    'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Thanjavur', 'Erode',
    'Vellore', 'Tirupati', 'Kochi', 'Cochin', 'Trivandrum', 'Thiruvananthapuram',
    'Kozhikode', 'Mysore', 'Mangalore', 'Ahmedabad', 'Surat', 'Jaipur',
    'Lucknow', 'Chandigarh', 'Gurgaon', 'Noida', 'Goa', 'Kanyakumari', 'Nagercoil',
  ];

  const cityPattern = new RegExp(`\\b(${cities.join('|')})\\b`, 'i');
  const cityMatch = text.match(cityPattern);
  if (cityMatch) {
    const pinMatch = text.match(new RegExp(`${cityMatch[1]}[\\s,–-]+(\\d{6})`, 'i'));
    if (pinMatch) {
      return `${cityMatch[1]} - ${pinMatch[1]}`;
    }
    return cityMatch[1];
  }

  return undefined;
}

export function extractNames(
  rawText: string,
  eventType: EventType | null
): { mainPerson: string | undefined; hostName: string | undefined } {
  let mainPerson: string | undefined;
  let hostName: string | undefined;

  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const fullText = rawText.replace(/\r\n/g, ' ').replace(/\n/g, ' ');

  // ─── 1. Tamil Bride & Groom pattern ───
  // மணமகள்: S. நிவேதா B.E. / மணமகன்: A. அந்தோணி விவேக் B.E.
  const brideMatch = fullText.match(/(?:மணமகள்|மணப்பெண்)\s*[:\-]?\s*([^\n,()]+(?:\s+B\.?E\.?|\s+M\.?B\.?B\.?S|\s+B\.?Tech|\s+M\.?E\.?)?)/i);
  const groomMatch = fullText.match(/(?:மணமகன்|மாப்பிள்ளை)\s*[:\-]?\s*([^\n,()]+(?:\s+B\.?E\.?|\s+M\.?B\.?B\.?S|\s+B\.?Tech|\s+M\.?E\.?)?)/i);

  if (brideMatch && groomMatch) {
    const bride = cleanPersonName(brideMatch[1]);
    const groom = cleanPersonName(groomMatch[1]);
    if (bride && groom) {
      mainPerson = `${bride} & ${groom}`;
    }
  } else if (brideMatch) {
    mainPerson = cleanPersonName(brideMatch[1]);
  } else if (groomMatch) {
    mainPerson = cleanPersonName(groomMatch[1]);
  }

  // ─── 2. Tamil Couple pattern: மணமக்கள்: X & Y ───
  if (!mainPerson) {
    const coupleTamilMatch = fullText.match(/மணமக்கள்\s*[:\-]?\s*([^\n]+)/i);
    if (coupleTamilMatch) {
      mainPerson = cleanPersonName(coupleTamilMatch[1]);
    }
  }

  // ─── 3. Multiline English / Tamil "weds" / "with" / "and" / "&" ───
  if (!mainPerson) {
    for (let i = 0; i < lines.length - 2; i++) {
      const line1 = lines[i];
      const connector = lines[i + 1].toLowerCase().trim();
      const line2 = lines[i + 2];

      if (['weds', 'with', '&', 'and'].includes(connector)) {
        const p1 = cleanPersonName(line1);
        const p2 = cleanPersonName(line2);
        if (
          p1 && p2 && p1.length >= 3 && p2.length >= 3 &&
          !/^(?:cordially|request|pleasure|marriage|wedding|reception)/i.test(p1)
        ) {
          mainPerson = `${p1} & ${p2}`;
          break;
        }
      }
    }
  }

  // ─── 4. Single-line couple match (supports Tamil Unicode & Latin) ───
  if (!mainPerson) {
    const coupleMatch = fullText.match(
      /\b((?:Chi\.?\s+|Selvan\.?\s+|Dr\.?\s+|Mr\.?\s+)?(?:[A-Z][A-Za-z]+|[A-Z]{2,}|[\u0B80-\u0BFF]+)(?:\s+(?:[A-Z][A-Za-z]+|[A-Z]{2,}|[\u0B80-\u0BFF]+)){0,3})\s+(?:weds|with|tying the knot with)\s+((?:Sow\.?\s+|Selvi\.?\s+|Dr\.?\s+|Ms\.?\s+|Miss\s+)?(?:[A-Z][A-Za-z]+|[A-Z]{2,}|[\u0B80-\u0BFF]+)(?:\s+(?:[A-Z][A-Za-z]+|[A-Z]{2,}|[\u0B80-\u0BFF]+)){0,3})\b/
    );
    if (coupleMatch) {
      const p1 = cleanPersonName(coupleMatch[1]);
      const p2 = cleanPersonName(coupleMatch[2]);
      if (p1 && p2 && !/^(?:cordially|request|pleasure|marriage|wedding|reception)/i.test(p1)) {
        mainPerson = `${p1} & ${p2}`;
      }
    }
  }

  // ─── 5. English Wedding Son/Daughter: "marriage of their son X with Y" ───
  if (!mainPerson) {
    const weddingOfMatch = fullText.match(
      /(?:marriage|wedding|reception)\s+of\s+(?:their\s+)?(?:son|daughter)?\s*([A-Za-z\u0B80-\u0BFF\s.'-]+?)\s+(?:with|weds|and)\s+([A-Za-z\u0B80-\u0BFF\s.'-]+?)(?=\s+on|\s+at|\s*\n|$)/i
    );
    if (weddingOfMatch) {
      const p1 = cleanPersonName(weddingOfMatch[1]);
      const p2 = cleanPersonName(weddingOfMatch[2]);
      if (p1 && p2) mainPerson = `${p1} & ${p2}`;
    }
  }

  // ─── 6. Protagonist Extraction (Birthday, Memorial, etc.) ───
  if (!mainPerson) {
    const bdayMatch = fullText.match(
      /(?:birthday\s+(?:celebration\s+)?of|celebrat(?:e|ing).*birthday\s+(?:celebration\s+)?of|felicitation\s+of|memorial\s+of|tribute\s+to|griha\s*pravesh\s+of|பிறந்தநாள்\s*காணும்|மணிவிழா\s*காணும்)\s+((?:Dr\.?|Mr\.?|Mrs\.?|Smt\.?|Sri\.?|Prof\.?)?\s*[A-Za-z\u0B80-\u0BFF]+(?:\s+[A-Za-z\u0B80-\u0BFF]+){0,3}?)(?=\s+(?:on|at|date|venue|in)\b|$)/i
    );
    if (bdayMatch) {
      const candidate = cleanPersonName(bdayMatch[1]);
      if (isValidPersonName(candidate)) {
        mainPerson = candidate;
      }
    }
  }

  // ─── 7. Business Inauguration / Grand Opening Entity ───
  if (!mainPerson) {
    const bizMatch = fullText.match(
      /(?:inauguration\s+of|grand\s*opening\s+of|launch\s+of|opening\s+of|திறப்பு\s*விழா)\s+([A-Za-z0-9\u0B80-\u0BFF]+(?:\s+[A-Za-z0-9\u0B80-\u0BFF]+){0,3}?)(?=\s+(?:on|at|date|venue|in)\b|$)/i
    );
    if (bizMatch) {
      const candidate = cleanPersonName(bizMatch[1]);
      if (candidate && candidate.length > 3) {
        mainPerson = candidate;
      }
    }
  }

  // ─── 8. Host Extraction ───
  // Tamil Host Markers: தங்கள் அன்புள்ள, அழைப்பாளர்கள், அன்புடன் அழைக்கும், இங்ஙனம், வரவேற்கும்
  const tamilHostMatch = fullText.match(
    /(?:தங்கள்\s+அன்புள்ள|அழைப்பாளர்கள்|அன்புடன்\s+அழைக்கும்|இங்ஙனம்|வரவேற்கும்|அழைப்பின்\s+மகிழ்வில்)\s*[,:\-]?\s*([A-Za-z\u0B80-\u0BFF\s.'-]+?(?:\s*[-–&,]\s*[A-Za-z\u0B80-\u0BFF\s.'-]+)?)(?=\s*மற்றும்|\s*அமைச்சரகம்|\s*அழைக்கின்றோம்|\s*\n\n|$)/i
  );
  if (tamilHostMatch) {
    hostName = cleanPersonName(tamilHostMatch[1]);
  }

  // English Formal Host Pattern: "Sri Ramesh Kumar & Smt. Padma Kumar cordially invite..."
  if (!hostName) {
    const formalHostMatch = fullText.match(
      /((?:Sri\.?|Mr\.?|Shri\.?)\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s*(?:&|and)\s*(?:Smt\.?|Mrs\.?)\s+[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(?:cordially\s+)?invite/i
    );
    if (formalHostMatch) {
      hostName = cleanPersonName(formalHostMatch[1]);
    }
  }

  // English Family Host Pattern: "Sri Arun Prakash & Family request..."
  if (!hostName) {
    const familyHostMatch = fullText.match(
      /((?:Sri\.?|Mr\.?|Dr\.?)\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s*&\s*Family)\s+(?:request|cordially)/i
    );
    if (familyHostMatch) {
      hostName = cleanPersonName(familyHostMatch[1]);
    }
  }

  // English Signoff Host Pattern
  if (!hostName) {
    const signoffMatch = fullText.match(/(?:cordially\s+invited\s+by|invited\s+by|with\s+love)\s*[,:\-]\s*([A-Za-z\s.&'-]+?)(?:\.|$)/i);
    if (signoffMatch && signoffMatch[1].length > 3 && signoffMatch[1].length < 50) {
      hostName = cleanPersonName(signoffMatch[1]);
    }
  }

  // Host Fallback for Family Celebrations
  if (!mainPerson && hostName && ['house_warming', 'anniversary'].includes(eventType || '')) {
    mainPerson = hostName;
  }

  return { mainPerson, hostName };
}

function cleanPersonName(name: string): string {
  if (!name) return '';
  return name
    .replace(/(?:(?:Software|Project|Civil|Mechanical)\s+(?:Developer|Engineer)[^,\n]*)/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/(?:\bcordially\b|\binvite\b|\brequest\b|\bpleasure\b|\bpresence\b|\bcompany\b|\breception\b|\bwedding\b|\bwith\b|\bweds\b|\band\b|&|\blunch\b|\bdinner\b|வாழ்த்தி|ஆசீர்வதிக்க|அழைக்கின்றோம்).*$/i, '')
    .replace(/^(?:at|on|for|the|of|our|மணமகள்|மணமகன்|மணமக்கள்|செல்வி|செல்வன்|திரு|திருமதி|டாக்டர்|Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Sri\.?|Smt\.?|Chi\.?|Sow\.?)\s*[:.\-]?\s*/gi, '')
    .replace(/[,;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidPersonName(name: string): boolean {
  if (!name || name.trim().length < 2 || name.length > 70) return false;
  const blacklist = /\b(?:wedding|invitation|reception|blessing|company|presence|venue|sunday|monday|tuesday|wednesday|thursday|friday|saturday|january|february|march|april|may|june|july|august|september|october|november|december|hotel|hall|mandapam|mahal|திருமண|அழைப்பிதழ்|வாழ்த்தி|ஆசீர்வதிக்க|வணக்கம்|நிகழ்ச்சி|மண்டபம்)\b/i;
  return !blacklist.test(name);
}

function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (y < 2020 || y > 2035) return false;
  if (m < 1 || m > 12) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d >= 1 && d <= daysInMonth;
}

function isValidTimeString(timeStr: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return false;
  const [h, m] = timeStr.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function generateTitle(eventType: EventType | null, mainPerson: string): string {
  if (!eventType && !mainPerson) return 'New Invitation';

  const typeLabels: Record<string, string> = {
    wedding: 'Wedding',
    engagement: 'Engagement',
    birthday: 'Birthday',
    anniversary: 'Anniversary',
    house_warming: 'House Warming',
    baby_shower: 'Baby Shower',
    graduation: 'Graduation',
    retirement: 'Retirement',
    funeral: 'Memorial',
    business_event: 'Business Event',
    reception: 'Reception',
    cultural: 'Cultural Event',
    religious: 'Religious Event',
    other: 'Event',
  };

  const isTamil = /[\u0B80-\u0BFF]/.test(mainPerson || '');
  if (isTamil && eventType === 'wedding') {
    return mainPerson ? `${mainPerson} — திருமண அழைப்பிதழ்` : 'திருமண அழைப்பிதழ்';
  }

  const label = typeLabels[eventType || 'other'] || 'Event';
  if (!mainPerson) return label;
  return `${mainPerson}'s ${label}`;
}

function generateDescription(text: string): string | undefined {
  const cleaned = text
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 10 ? cleaned.substring(0, 250) : undefined;
}

// ─── Person Matcher ──────────────────────────────────────────────────────────
// Fuzzy-matches extracted names against stored people

export function findMatchingPerson(
  extractedFields: ExtractedFields,
  people: Person[]
): Person | undefined {
  const searchTerms: string[] = [];

  if (extractedFields.mainPerson) {
    // Also split by '&', 'weds', 'with', 'and'
    const parts = extractedFields.mainPerson.split(/\s*(?:&|weds|with|and)\s*/i);
    for (const p of parts) {
      if (p.trim()) searchTerms.push(p.trim().toLowerCase());
    }
    searchTerms.push(extractedFields.mainPerson.toLowerCase());
  }

  if (extractedFields.hostName) {
    const parts = extractedFields.hostName.split(/\s*(?:&|and)\s*/i);
    for (const p of parts) {
      if (p.trim()) searchTerms.push(p.trim().toLowerCase());
    }
    searchTerms.push(extractedFields.hostName.toLowerCase());
  }

  const ignoreWords = new Set([
    'sri', 'smt', 'shri', 'mr', 'mrs', 'dr', 'prof', 'chi', 'sow', 'selvan', 'selvi', 'family', 'the', 'and',
    'திரு', 'திருமதி', 'செல்வன்', 'செல்வி', 'டாக்டர்', 'அவர்கள்', 'மகன்', 'மகள்',
  ]);

  let bestMatch: Person | undefined;
  let bestScore = 0;

  for (const person of people) {
    const pName = person.name.toLowerCase();
    const pNick = person.nickname.toLowerCase();
    const nameWords = pName.split(/\s+/).filter((w) => !ignoreWords.has(w) && w.length >= 3);
    const nickWords = pNick.split(/\s+/).filter((w) => !ignoreWords.has(w) && w.length >= 3);
    const allWords = [...nameWords, ...nickWords];

    for (const term of searchTerms) {
      // 1. Exact full match
      if (term === pName || term === pNick) {
        return person;
      }

      // 2. Contains full person name or nickname
      if (term.includes(pName) || (pNick.length >= 4 && term.includes(pNick))) {
        return person;
      }

      // 3. Word token matching
      const termWords = term.split(/\s+/).filter((w) => !ignoreWords.has(w) && w.length >= 3);
      let matchCount = 0;

      for (const tw of termWords) {
        for (const pw of allWords) {
          if (pw === tw) {
            matchCount += 3;
          } else if (pw.includes(tw) || tw.includes(pw)) {
            matchCount += 1;
          }
        }
      }

      if (matchCount > bestScore && matchCount >= 2) {
        bestScore = matchCount;
        bestMatch = person;
      }
    }
  }

  return bestMatch;
}

// ─── Relationship History Builder ────────────────────────────────────────────

export function getRelationshipHistory(
  personId: string,
  familyEvents: FamilyEvent[]
): RelationshipHistoryItem[] {
  const history: RelationshipHistoryItem[] = [];

  for (const event of familyEvents) {
    const guest = event.guests.find((g) => g.personId === personId);
    if (guest) {
      history.push({
        eventName: event.name,
        eventDate: event.date,
        eventType: event.eventType,
        role: guest.attendance === 'attended' ? 'Attended' : 'Invited (not attended)',
      });
    }
  }

  return history.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

// ─── Gift History Builder ────────────────────────────────────────────────────

export function getGiftHistory(
  personId: string,
  familyEvents: FamilyEvent[]
): GiftHistoryItem[] {
  const gifts: GiftHistoryItem[] = [];

  for (const event of familyEvents) {
    const guest = event.guests.find(
      (g) => g.personId === personId && g.gift
    );
    if (guest && guest.gift) {
      gifts.push({
        eventName: event.name,
        eventDate: event.date,
        gift: guest.gift,
        giftCategory: guest.giftCategory,
        estimatedValue: guest.estimatedValue,
      });
    }
  }

  return gifts.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

// ─── Schedule Conflict Detector ──────────────────────────────────────────────

export function detectScheduleConflicts(
  date: string,
  time: string | undefined,
  schedule: ScheduleItem[],
  existingInvitations: Invitation[]
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  // Check schedule items on the same date
  const sameDaySchedule = schedule.filter((s) => s.date === date);
  for (const item of sameDaySchedule) {
    if (time && item.startTime) {
      // Check time overlap
      const eventHour = parseInt(time.split(':')[0]);
      const scheduleHour = parseInt(item.startTime.split(':')[0]);
      const scheduleEndHour = item.endTime
        ? parseInt(item.endTime.split(':')[0])
        : scheduleHour + 2;

      if (eventHour >= scheduleHour && eventHour < scheduleEndHour) {
        conflicts.push({
          conflictingItemId: item.id,
          conflictingItemTitle: item.title,
          conflictingTime: `${item.startTime}${item.endTime ? ' - ' + item.endTime : ''}`,
          type: 'time_overlap',
        });
      } else {
        conflicts.push({
          conflictingItemId: item.id,
          conflictingItemTitle: item.title,
          conflictingTime: `${item.startTime}${item.endTime ? ' - ' + item.endTime : ''}`,
          type: 'same_day',
        });
      }
    } else {
      conflicts.push({
        conflictingItemId: item.id,
        conflictingItemTitle: item.title,
        conflictingTime: `${item.startTime}${item.endTime ? ' - ' + item.endTime : ''}`,
        type: 'same_day',
      });
    }
  }

  // Check other invitations on the same date
  const sameDayInvitations = existingInvitations.filter(
    (inv) => inv.date === date && inv.status !== 'ignored'
  );
  for (const inv of sameDayInvitations) {
    conflicts.push({
      conflictingItemId: inv.id,
      conflictingItemTitle: inv.nickname || inv.title,
      conflictingTime: inv.time || 'Time not specified',
      type: 'same_day',
    });
  }

  return conflicts;
}

// ─── Priority Calculator ─────────────────────────────────────────────────────

export function calculatePriority(
  person: Person | undefined,
  relationshipHistory: RelationshipHistoryItem[],
  giftHistory: GiftHistoryItem[],
  conflicts: ScheduleConflict[]
): { priority: Priority; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  if (!person) {
    return {
      priority: 'low',
      reason: 'No matching person found in your contacts. Consider adding this person to your network.',
    };
  }

  // Relationship type scoring
  const relationshipScores: Record<string, number> = {
    family: 40,
    relative: 35,
    business_partner: 30,
    client: 25,
    colleague: 20,
    friend: 25,
    neighbor: 15,
    acquaintance: 10,
    other: 5,
  };

  score += relationshipScores[person.relationship] || 5;
  reasons.push(
    `${person.nickname || person.name} is your ${person.relationship.replace('_', ' ')}.`
  );

  // Previous attendance scoring
  const attendedEvents = relationshipHistory.filter((h) => h.role === 'Attended');
  if (attendedEvents.length > 0) {
    score += attendedEvents.length * 15;
    reasons.push(
      `Attended ${attendedEvents.length} of your family event${attendedEvents.length > 1 ? 's' : ''}: ${attendedEvents.map((e) => e.eventName.replace("Jaison's ", '')).join(', ')}.`
    );
  }

  // Gift value scoring
  const totalGiftValue = giftHistory.reduce(
    (sum, g) => sum + (g.estimatedValue || 0),
    0
  );
  if (totalGiftValue > 50000) {
    score += 25;
    reasons.push(
      `Previously gave high-value gifts totaling ₹${totalGiftValue.toLocaleString('en-IN')}.`
    );
  } else if (totalGiftValue > 20000) {
    score += 15;
    reasons.push(
      `Previously gave gifts valued at ₹${totalGiftValue.toLocaleString('en-IN')}.`
    );
  } else if (totalGiftValue > 0) {
    score += 8;
    reasons.push(
      `Previously gave gifts valued at ₹${totalGiftValue.toLocaleString('en-IN')}.`
    );
  }

  // Gift category bonus
  const hasGoldGift = giftHistory.some((g) => g.giftCategory === 'gold');
  if (hasGoldGift) {
    score += 10;
    reasons.push('Has given gold gifts — indicates strong relationship.');
  }

  // Conflict awareness
  const timeConflicts = conflicts.filter((c) => c.type === 'time_overlap');
  if (timeConflicts.length > 0) {
    reasons.push(
      `Schedule conflict detected: ${timeConflicts.map((c) => `${c.conflictingItemTitle} at ${c.conflictingTime}`).join(', ')}.`
    );
  }

  // Determine priority
  let priority: Priority;
  if (score >= 50) {
    priority = 'high';
  } else if (score >= 25) {
    priority = 'medium';
  } else {
    priority = 'low';
  }

  return {
    priority,
    reason: reasons.join(' '),
  };
}

// ─── Full AI Analysis Pipeline ───────────────────────────────────────────────

export function runAIAnalysis(
  ocrText: string,
  people: Person[],
  familyEvents: FamilyEvent[],
  schedule: ScheduleItem[],
  existingInvitations: Invitation[],
  rawOcr?: { rawText: string; confidence: number },
  visionFields?: ExtractedFields
): AIAnalysis {
  // Step 1: Use Vision API fields if available, otherwise parse OCR text with regex
  const extractedFields = visionFields || parseOCRText(ocrText);

  // Step 2: Find matching person
  const relatedPerson = findMatchingPerson(extractedFields, people);

  // Step 3: Get relationship history
  const relationshipHistory = relatedPerson
    ? getRelationshipHistory(relatedPerson.id, familyEvents)
    : [];

  // Step 4: Get gift history
  const giftHistory = relatedPerson
    ? getGiftHistory(relatedPerson.id, familyEvents)
    : [];

  // Step 5: Check schedule conflicts
  const scheduleConflicts = extractedFields.date
    ? detectScheduleConflicts(
        extractedFields.date,
        extractedFields.time,
        schedule,
        existingInvitations
      )
    : [];

  // Step 6: Calculate priority
  const { priority, reason } = calculatePriority(
    relatedPerson,
    relationshipHistory,
    giftHistory,
    scheduleConflicts
  );

  // Step 7: Calculate overall confidence
  const fieldConfidences = Object.values(extractedFields.confidence);
  const avgConfidence =
    fieldConfidences.reduce((sum, c) => sum + c, 0) / fieldConfidences.length;

  return {
    id: generateId('analysis'),
    invitationId: '',
    ocrText,
    rawOcr,
    extractedFields,
    confidence: rawOcr?.confidence ? Math.round(rawOcr.confidence * 100) / 100 : Math.round(avgConfidence * 100) / 100,
    relatedPerson,
    relationshipHistory,
    giftHistory,
    scheduleConflicts,
    suggestedPriority: priority,
    priorityReason: reason,
  };
}

// ─── Demo OCR Text (for when Tesseract can't process) ────────────────────────

export const DEMO_OCR_TEXTS = [
  `With the Blessings of God
Sri Ramesh Kumar & Smt. Padma Kumar
cordially invite you to the Wedding Reception of their son
KARTHIK KUMAR
with
DIVYA SHARMA
on Sunday, August 30, 2026
at 6:00 PM
Venue: Chennai Convention Centre
Mount Road, Chennai - 600002
Dinner to follow
RSVP: +91 98765 43210`,

  `You are cordially invited to celebrate
the 60th Birthday of
Dr. Lakshmi Iyer
on September 5, 2026
at 7:00 PM
Venue: Hotel Savera
RK Salai, Chennai
Cultural program and Dinner
With love, Iyer Family`,

  `Wedding Invitation
Sri Arun Prakash & Family
request the pleasure of your company
at the marriage of their daughter
SNEHA PRAKASH
with
RAJESH KUMAR
on Monday, September 15, 2026
Muhurtham: 11:15 AM
Venue: Kalyana Mandapam, T. Nagar, Chennai
Lunch to follow`,

  `Gruhapravesam Invitation
Mr. Suresh Raman & Mrs. Geetha Raman
cordially invite you with family to the
House Warming Ceremony of our new residence
on Sunday, October 11, 2026
Muhurtham: 6:00 AM - 7:30 AM
Venue: Raman Illam, Plot 42, Anna Nagar, Chennai
Breakfast to follow`,

  `Grand Opening Invitation
We cordially invite you to the
Inauguration of Apex Tech Solutions
on Friday, November 20, 2026
at 10:30 AM
Venue: Leela Palace Banquet Hall, Adyar, Chennai
RSVP: +91 94440 12345`,
];
