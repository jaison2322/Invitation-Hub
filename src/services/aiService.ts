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
  const text = ocrText.toLowerCase();
  const confidence: Record<string, number> = {};

  // Detect event type
  const eventType = detectEventType(text);
  confidence.eventType = eventType ? 0.90 : 0.35;

  // Extract date
  const dateResult = extractDate(ocrText);
  confidence.date = dateResult ? 0.90 : 0.25;

  // Extract time
  const timeResult = extractTime(ocrText);
  confidence.time = timeResult ? 0.88 : 0.30;

  // Extract venue
  const venueResult = extractVenue(ocrText);
  confidence.venue = venueResult ? 0.85 : 0.25;

  // Extract location / city
  const locationResult = extractLocation(ocrText);

  // Extract names (bride/groom, protagonist, host)
  const namesResult = extractNames(ocrText, eventType);
  confidence.mainPerson = namesResult.mainPerson ? 0.82 : 0.25;
  confidence.hostName = namesResult.hostName ? 0.75 : 0.20;

  // Generate title
  const title = generateTitle(eventType, namesResult.mainPerson || '');
  confidence.title = title ? 0.85 : 0.35;

  return {
    eventType: eventType || 'other',
    title,
    mainPerson: namesResult.mainPerson,
    hostName: namesResult.hostName,
    date: dateResult || undefined,
    time: timeResult || undefined,
    venue: venueResult || undefined,
    location: locationResult,
    description: generateDescription(ocrText),
    confidence,
  };
}

export function detectEventType(text: string): EventType | null {
  const patterns: [RegExp, EventType][] = [
    [/house\s*warm|griha\s*pravesh|gruhapravesam|new\s*home|new\s*residence|vastu\s*puja|graha\s*pravesh/i, 'house_warming'],
    [/birthday|b'day|birth day|bday|turning\s+\d+|celebrat.*birthday|shashti\s*poorthi|sadhabishekam/i, 'birthday'],
    [/baby\s*shower|seemantham|valaikappu|godh\s*bharai|cradling|namakaranam|naming\s*ceremony/i, 'baby_shower'],
    [/engagement|betrothal|ring ceremony|nischayam|nischayathartham|roka|sagai/i, 'engagement'],
    [/anniversary|silver jubilee|golden jubilee/i, 'anniversary'],
    [/graduation|convocation|commencement/i, 'graduation'],
    [/retirement|farewell|superannuation/i, 'retirement'],
    [/funeral|condolence|memorial|prayer\s*meeting|remembrance|shraddh|tribute/i, 'funeral'],
    [/conference|seminar|launch|inaugur|summit|business|grand\s*opening|ribbon\s*cutting|annual\s*general\s*meeting/i, 'business_event'],
    [/puja|pooja|havan|homam|temple|religious|upanayanam|thread\s*ceremony|poonal|kumbhabhishekam|bhajan|kirtan|aradhana/i, 'religious'],
    [/cultural|dance|music|concert|arangetram|drama|carnatic/i, 'cultural'],
    [/wedding|marriage|vivah|kalyanam|thirumanam|muhurtham|muhurtam|bride|groom|weds|tie the knot|nuptial|nikah|walima|matthalam|mangalyam/i, 'wedding'],
    [/reception|sangeet|mehendi|haldi|cocktail/i, 'reception'],
  ];

  for (const [pattern, type] of patterns) {
    if (pattern.test(text)) return type;
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

  // Pattern 1: ISO YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const isoMatch = text.match(/\b(20\d{2})[\/\-.](0?[1-9]|1[0-2])[\/\-.](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](20\d{2})\b/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Pattern 3: DD/MM/YY or DD-MM-YY (2-digit year)
  const dmyShortYearMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](\d{2})\b/);
  if (dmyShortYearMatch) {
    const [, day, month, shortYear] = dmyShortYearMatch;
    const year = `20${shortYear}`;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Pattern 4: Month DD, YYYY or Month DD YYYY (e.g. August 30, 2026 or Sept 15, 2026)
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

  // Pattern 5: DD Month YYYY (e.g. 30th August 2026 or 15 September 2026 or 15th of Oct 2026)
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

  // Pattern 6: Month and Day without year (default to 2026)
  const monthDayNoYearMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b/i
  );
  if (monthDayNoYearMatch) {
    const monthKey = monthDayNoYearMatch[1].toLowerCase().replace('.', '');
    const monthNum = months[monthKey];
    if (monthNum) {
      return `2026-${monthNum}-${monthDayNoYearMatch[2].padStart(2, '0')}`;
    }
  }

  return null;
}

export function extractTime(rawText: string): string | null {
  const text = rawText.replace(/\r\n/g, ' ').replace(/\n/g, ' ');

  // Look for contextual keywords before time (e.g., Muhurtham: 11:15 AM, Reception: 6:00 PM)
  const contextMatch = text.match(/(?:muhurtham|muhurtam|reception|timing|time|at)\s*[:\-]?\s*(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m|p\.m)?/i);
  if (contextMatch) {
    let hours = parseInt(contextMatch[1]);
    const minutes = contextMatch[2];
    const meridiem = contextMatch[3]?.replace(/\./g, '').toLowerCase();

    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Time range pattern: 9:00 AM - 10:30 AM (extract start time)
  const rangeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m|p\.m)?\s*(?:to|-|–)\s*(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m|p\.m)/i);
  if (rangeMatch) {
    let hours = parseInt(rangeMatch[1]);
    const minutes = rangeMatch[2];
    // If start doesn't have AM/PM, borrow from end
    const meridiem = (rangeMatch[3] || rangeMatch[6])?.replace(/\./g, '').toLowerCase();

    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Standard HH:MM AM/PM
  const timeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m|p\.m)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2];
    const meridiem = timeMatch[3]?.replace(/\./g, '').toLowerCase();

    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Simple "6 PM" or "10 AM" style
  const simpleTimeMatch = text.match(/\b(\d{1,2})\s*(am|pm|a\.m|p\.m)\b/i);
  if (simpleTimeMatch) {
    let hours = parseInt(simpleTimeMatch[1]);
    const meridiem = simpleTimeMatch[2].replace(/\./g, '').toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:00`;
  }

  return null;
}

export function extractVenue(rawText: string): string | null {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  // 1. Explicit Venue line: "Venue: Chennai Convention Centre"
  for (const line of lines) {
    const venueMatch = line.match(/(?:venue|place|location|held at)\s*[:\-]\s*(.+)$/i);
    if (venueMatch) {
      const cleaned = cleanVenueText(venueMatch[1]);
      if (cleaned) return cleaned;
    }
  }

  // 2. Line containing venue keywords
  const venueKeywords = /(?:kalyana\s*mandapam|mandapam|mahal|convention\s*centre|convention\s*center|palace|hall|hotel|resort|auditorium|bhavan|banquet|gardens|lawn|grounds|cathedral|church|temple)/i;

  for (const line of lines) {
    if (venueKeywords.test(line)) {
      // Remove leading "at" or "at the"
      const cleaned = cleanVenueText(line.replace(/^(?:at\s+(?:the\s+)?)/i, ''));
      if (cleaned && cleaned.length > 4) return cleaned;
    }
  }

  // 3. Fallback inline regex across full text
  const text = rawText.replace(/\r\n/g, ' ').replace(/\n/g, ' ');
  const inlineMatch = text.match(/at\s+(?:the\s+)?([A-Za-z0-9\s.,'&-]+?(?:hall|hotel|palace|mandapam|mahal|convention\s*centre|convention\s*center|resort|auditorium|bhavan|banquet|garden))/i);
  if (inlineMatch) {
    const cleaned = cleanVenueText(inlineMatch[1]);
    if (cleaned) return cleaned;
  }

  return null;
}

function cleanVenueText(text: string): string {
  return text
    .replace(/(?:dinner|lunch|breakfast|reception|muhurtham|rsvp|phone|contact|with best).*$/i, '')
    .replace(/[,.\-\s]+$/, '')
    .trim();
}

export function extractLocation(rawText: string): string | undefined {
  const text = rawText.replace(/\r\n/g, ' ').replace(/\n/g, ' ');

  // 1. Explicit location/address label
  const addressMatch = text.match(/(?:address|city|place)\s*[:\-]\s*([A-Za-z0-9\s,.-]+?)(?:(?=phone|rsvp|dinner|lunch|date|time)|$)/i);
  if (addressMatch && addressMatch[1].trim().length > 3) {
    return addressMatch[1].trim();
  }

  // 2. City name search
  const cities = [
    'Chennai', 'Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'New Delhi',
    'Hyderabad', 'Kolkata', 'Pune', 'Coimbatore', 'Madurai', 'Trichy',
    'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Thanjavur', 'Erode',
    'Vellore', 'Tirupati', 'Kochi', 'Cochin', 'Trivandrum', 'Thiruvananthapuram',
    'Kozhikode', 'Mysore', 'Mangalore', 'Ahmedabad', 'Surat', 'Jaipur',
    'Lucknow', 'Chandigarh', 'Gurgaon', 'Noida', 'Goa',
  ];

  const cityPattern = new RegExp(`\\b(${cities.join('|')})\\b`, 'i');
  const cityMatch = text.match(cityPattern);
  if (cityMatch) {
    // Check if there's a pincode nearby (e.g. Chennai - 600002)
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

  // ─── 1. Host Name Extraction ──────────────────────────────────────────────
  // Pattern A: "Sri Ramesh Kumar & Smt. Padma Kumar cordially invite you..."
  const formalHostMatch = fullText.match(
    /((?:Sri\.?|Mr\.?|Shri\.?)\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s*(?:&|and)\s*(?:Smt\.?|Mrs\.?)\s+[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(?:cordially\s+)?invite/i
  );
  if (formalHostMatch) {
    hostName = cleanName(formalHostMatch[1]);
  }

  // Pattern B: "Sri Arun Prakash & Family request the pleasure..."
  if (!hostName) {
    const familyHostMatch = fullText.match(
      /((?:Sri\.?|Mr\.?|Dr\.?)\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s*&\s*Family)\s+(?:request|cordially)/i
    );
    if (familyHostMatch) {
      hostName = cleanName(familyHostMatch[1]);
    }
  }

  // Pattern C: "Cordially invited by: X" or "With love, Iyer Family"
  if (!hostName) {
    const signoffMatch = fullText.match(/(?:cordially\s+invited\s+by|invited\s+by|with\s+love)\s*[,:\-]\s*([A-Za-z\s.&'-]+?)(?:\.|$)/i);
    if (signoffMatch && signoffMatch[1].length > 3 && signoffMatch[1].length < 50) {
      hostName = cleanName(signoffMatch[1]);
    }
  }

  // ─── 2. Bride & Groom / Couple Extraction (Wedding / Reception / Engagement) ─
  // Pattern A: "weds" or "with" or "&" between two names (supports ALL CAPS and Mixed Case)
  // e.g., "KARTHIK KUMAR with DIVYA SHARMA" or "SNEHA PRAKASH weds RAJESH KUMAR"
  const coupleMatch = fullText.match(
    /\b((?:Chi\.?\s+|Selvan\.?\s+|Dr\.?\s+|Mr\.?\s+)?(?:[A-Z][A-Za-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z]+|[A-Z]{2,}))*)\s+(?:weds|with|tying the knot with)\s+((?:Sow\.?\s+|Selvi\.?\s+|Dr\.?\s+|Ms\.?\s+|Miss\s+)?(?:[A-Z][A-Za-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z]+|[A-Z]{2,}))*)\b/
  );

  if (coupleMatch) {
    const person1 = cleanName(coupleMatch[1]);
    const person2 = cleanName(coupleMatch[2]);
    if (isValidPersonName(person1) && isValidPersonName(person2)) {
      mainPerson = `${person1} & ${person2}`;
    }
  }

  // Pattern B: Multiline "weds" / "with" / "and"
  if (!mainPerson) {
    for (let i = 0; i < lines.length - 2; i++) {
      const line1 = lines[i];
      const connector = lines[i + 1].toLowerCase().trim();
      const line2 = lines[i + 2];

      if (['weds', 'with', '&', 'and'].includes(connector)) {
        const p1 = cleanName(line1);
        const p2 = cleanName(line2);
        if (isValidPersonName(p1) && isValidPersonName(p2)) {
          mainPerson = `${p1} & ${p2}`;
          break;
        }
      }
    }
  }

  // ─── 3. Single Protagonist Extraction (Birthday, Anniversary, Memorial, etc.) ─
  if (!mainPerson) {
    // "Birthday of Dr. Lakshmi Iyer"
    const bdayMatch = fullText.match(
      /(?:birthday\s+(?:celebration\s+)?of|celebrat(?:e|ing).*birthday\s+(?:celebration\s+)?of|felicitation\s+of|memorial\s+of|tribute\s+to|griha\s*pravesh\s+of)\s+((?:Dr\.?|Mr\.?|Mrs\.?|Smt\.?|Sri\.?|Prof\.?)?\s*[A-Za-z]+(?:\s+[A-Za-z]+){0,3}?)(?=\s+(?:on|at|date|venue|in)\b|$)/i
    );
    if (bdayMatch) {
      const candidate = cleanName(bdayMatch[1]);
      if (isValidPersonName(candidate)) {
        mainPerson = candidate;
      }
    }
  }

  // ─── 4. Business Inauguration / Grand Opening Entity ───────────────────────
  if (!mainPerson) {
    const bizMatch = fullText.match(
      /(?:inauguration\s+of|grand\s*opening\s+of|launch\s+of|opening\s+of)\s+([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){0,3}?)(?=\s+(?:on|at|date|venue|in)\b|$)/i
    );
    if (bizMatch) {
      const candidate = cleanName(bizMatch[1]);
      if (candidate && candidate.length > 3) {
        mainPerson = candidate;
      }
    }
  }

  // ─── 5. Son/Daughter of pattern ───────────────────────────────────────────
  if (!mainPerson) {
    const childMatch = fullText.match(
      /(?:son|daughter|s\/o|d\/o)\s+(?:of\s+)?(?:our\s+)?([A-Za-z\s.&'-]+?)(?:\s+with|\s+weds|\s+on|\s+at|$)/i
    );
    if (childMatch) {
      const candidate = cleanName(childMatch[1]);
      if (isValidPersonName(candidate)) {
        mainPerson = candidate;
      }
    }
  }

  // ─── 6. Host Fallback for Family Celebrations ─────────────────────────────
  if (!mainPerson && hostName && ['house_warming', 'anniversary'].includes(eventType || '')) {
    mainPerson = hostName;
  }

  // ─── 7. Fallback: Search for prominent capitalized name in top lines ───────
  if (!mainPerson) {
    for (const line of lines.slice(0, 8)) {
      if (
        /^[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){1,3}$/.test(line) &&
        !/wedding|invitation|reception|blessing|cordially|pleasure|company|presence|venue|hotel|hall|sunday|monday|tuesday|wednesday|thursday|friday|saturday/i.test(line)
      ) {
        mainPerson = line;
        break;
      }
    }
  }

  return { mainPerson, hostName };
}

function cleanName(name: string): string {
  return name
    .replace(/(?:\bcordially\b|\binvite\b|\brequest\b|\bpleasure\b|\bpresence\b|\bcompany\b|\breception\b|\bwedding\b|\bwith\b|\bweds\b|\band\b|&|\blunch\b|\bdinner\b).*$/i, '')
    .replace(/^(?:at|on|for|the|of|our)\s+/i, '')
    .replace(/[,;:]+$/, '')
    .trim();
}

function isValidPersonName(name: string): boolean {
  if (!name || name.length < 3 || name.length > 50) return false;
  // Ignore if it's a common greeting or location word
  const blacklist = /\b(?:wedding|invitation|reception|blessing|company|presence|venue|sunday|monday|tuesday|wednesday|thursday|friday|saturday|january|february|march|april|may|june|july|august|september|october|november|december|hotel|hall|mandapam|mahal)\b/i;
  return !blacklist.test(name);
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

  const ignoreWords = new Set(['sri', 'smt', 'shri', 'mr', 'mrs', 'dr', 'prof', 'chi', 'sow', 'selvan', 'selvi', 'family', 'the', 'and']);

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
  existingInvitations: Invitation[]
): AIAnalysis {
  // Step 1: Parse OCR text
  const extractedFields = parseOCRText(ocrText);

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
    extractedFields,
    confidence: Math.round(avgConfidence * 100) / 100,
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
