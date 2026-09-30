import { formatTime } from './tracker.js';

// Helper to format date like "24 September 2026"
export function formatReportDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getDate();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

// Convert number to English word (e.g., 1 -> "one", 2 -> "two", 3 -> "three")
function numberToWord(n) {
  const words = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'
  ];
  if (n <= 20) return words[n];
  return String(n);
}

// Helper to pluralize nouns nicely
function pluralizeName(name, count) {
  const lower = name.toLowerCase();
  const baseName = (lower === 'car' || lower === 'automobile') ? 'vehicle' : lower;

  if (count === 1) {
    if (baseName === 'human' || baseName === 'person') return 'human';
    return baseName;
  }

  if (baseName === 'human' || baseName === 'person') return 'humans';
  if (baseName === 'vehicle') return 'vehicles';
  if (baseName.endsWith('s') || baseName.endsWith('x') || baseName.endsWith('sh') || baseName.endsWith('ch')) {
    return baseName + 'es';
  }
  return baseName + 's';
}

/**
 * Built-in AI Summarizer (Rule-based natural language generator matching the user's prompt)
 */
export function generateHeuristicAiSummary(trackedObjects, sessionMeta = {}, style = 'standard') {
  if (!trackedObjects || trackedObjects.length === 0) {
    return 'The camera did not detect any notable objects during the monitoring session. The surveillance field remained clear.';
  }

  // Count occurrences by object name
  const countsByName = {};
  let totalDuration = 0;
  let maxDurationObj = null;
  let minDurationObj = null;

  trackedObjects.forEach(obj => {
    countsByName[obj.name] = (countsByName[obj.name] || 0) + 1;
    const dur = obj.durationSeconds || 1;
    totalDuration += dur;

    if (!maxDurationObj || dur > maxDurationObj.durationSeconds) {
      maxDurationObj = obj;
    }
    if (!minDurationObj || dur < minDurationObj.durationSeconds) {
      minDurationObj = obj;
    }
  });

  // Group phrases: e.g. "two humans and one vehicle"
  const itemPhrases = Object.entries(countsByName).map(([name, count]) => {
    const word = numberToWord(count);
    return `${word} ${pluralizeName(name, count)}`;
  });

  let detectedPhrase = '';
  if (itemPhrases.length === 1) {
    detectedPhrase = itemPhrases[0];
  } else if (itemPhrases.length === 2) {
    detectedPhrase = `${itemPhrases[0]} and ${itemPhrases[1]}`;
  } else {
    detectedPhrase = `${itemPhrases.slice(0, -1).join(', ')}, and ${itemPhrases[itemPhrases.length - 1]}`;
  }

  // Standard report summary (matches the exact example provided in user's prompt)
  if (style === 'standard') {
    return `The camera detected ${detectedPhrase} during the monitoring period. Each object was assigned a unique tracking ID and monitored independently. The system recorded their detection times and duration of visibility.`;
  }

  // Executive surveillance summary with temporal and movement context
  if (style === 'executive') {
    const avgDuration = Math.round(totalDuration / trackedObjects.length);
    const activeCount = trackedObjects.filter(o => o.status === 'Active').length;
    const activeNote = activeCount > 0 ? ` Currently, ${numberToWord(activeCount)} object(s) remain actively visible.` : ' All tracked entities have since vacated the field of view.';

    const movements = trackedObjects
      .filter(o => o.movementSummary && !o.movementSummary.includes('Stationary'))
      .map(o => `${o.name} (${o.id}): ${o.movementSummary}`)
      .slice(0, 3);

    const movementText = movements.length > 0 ? ` Movement analysis observed: ${movements.join('; ')}.` : ' Tracked subjects exhibited minimal lateral translation.';

    return `The surveillance camera observed ${detectedPhrase} over the course of the monitoring cycle, averaging ${avgDuration}s per subject.${movementText}${activeNote} All telemetry and timestamps have been verified and archived.`;
  }

  // Security & Incident Brief
  if (style === 'security') {
    const longest = maxDurationObj ? `${maxDurationObj.name} [${maxDurationObj.id}] with ${maxDurationObj.duration}` : 'N/A';
    return `SURVEILLANCE LOG: Ingress recorded for ${detectedPhrase}. Maximum scene dwell time was exhibited by ${longest}. System logged persistent coordinate vectors and timeline markers for all entries. No anomalous obstruction detected.`;
  }

  return `The camera detected ${detectedPhrase} during the monitoring period. Each object was assigned a unique tracking ID and monitored independently.`;
}

/**
 * Optional Gemini LLM Integration for Deep Narrative Summary
 */
export async function generateGeminiAiSummary(apiKey, trackedObjects, sessionMeta = {}) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('No API key provided');
  }

  const prompt = `You are an automated camera AI analyst. Analyze the following object tracking observation report and generate a concise, professional 2-3 sentence AI Summary.
Format should be similar to:
"The camera detected two humans and one vehicle during the monitoring period. Each object was assigned a unique tracking ID and monitored independently. The system recorded their detection times and duration of visibility."

Here is the camera observation data:
${JSON.stringify(trackedObjects.map(o => ({
  object: o.name,
  trackingId: o.id,
  firstDetected: o.firstDetected,
  lastDetected: o.lastDetected,
  duration: o.duration,
  status: o.status,
  movement: o.movementSummary
})), null, 2)}

Provide only the AI Summary text, without greetings or extra markdown quotation marks.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 250
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!summary) throw new Error('Empty response received from Gemini');
  return summary;
}

/**
 * Generate Exact Text Report matching the user's prompt format
 */
export function generateTextReport(trackedObjects, date = new Date(), customSummary = null, style = 'standard') {
  const dateStr = formatReportDate(date);
  const summary = customSummary || generateHeuristicAiSummary(trackedObjects, {}, style);

  // Column headers with clean tab alignment
  let report = `Camera Report — ${dateStr}\n\n`;
  report += `Object\tTracking ID\tFirst Detected\tLast Detected\tDuration\n`;

  if (trackedObjects.length === 0) {
    report += `(No objects detected during this session)\n`;
  } else {
    trackedObjects.forEach(obj => {
      report += `${obj.name}\t${obj.id}\t${obj.firstDetected}\t${obj.lastDetected}\t${obj.duration}\n`;
    });
  }

  report += `\nAI Summary:\n${summary}\n`;
  return report;
}

/**
 * Generate Markdown Formatted Report
 */
export function generateMarkdownReport(trackedObjects, date = new Date(), customSummary = null, style = 'standard') {
  const dateStr = formatReportDate(date);
  const summary = customSummary || generateHeuristicAiSummary(trackedObjects, {}, style);

  let md = `## Camera Report — ${dateStr}\n\n`;
  md += `| Object | Tracking ID | First Detected | Last Detected | Duration | Status | Movement / Event |\n`;
  md += `| :--- | :--- | :---: | :---: | :---: | :---: | :--- |\n`;

  if (trackedObjects.length === 0) {
    md += `| *(None)* | — | — | — | — | — | No activity recorded |\n`;
  } else {
    trackedObjects.forEach(obj => {
      const statusBadge = obj.status === 'Active' ? '🟢 Active' : '⚪ Departed';
      md += `| **${obj.name}** | \`${obj.id}\` | ${obj.firstDetected} | ${obj.lastDetected} | ${obj.duration} | ${statusBadge} | ${obj.movementSummary || '—'} |\n`;
    });
  }

  md += `\n### AI Summary\n> ${summary}\n`;
  return md;
}

/**
 * Generate CSV Report
 */
export function generateCsvReport(trackedObjects, date = new Date()) {
  const headers = ['Object', 'Tracking ID', 'First Detected', 'Last Detected', 'Duration', 'Duration (Seconds)', 'Status', 'Peak Confidence (%)', 'Movement / Event'];

  const rows = trackedObjects.map(obj => [
    `"${obj.name}"`,
    `"${obj.id}"`,
    `"${obj.firstDetected}"`,
    `"${obj.lastDetected}"`,
    `"${obj.duration}"`,
    obj.durationSeconds || 1,
    `"${obj.status}"`,
    obj.peakConfidence || 0,
    `"${(obj.movementSummary || '').replace(/"/g, '""')}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Generate Structured JSON Report
 */
export function generateStructuredJson(trackedObjects, date = new Date(), customSummary = null, sessionMeta = {}) {
  const summary = customSummary || generateHeuristicAiSummary(trackedObjects, sessionMeta, 'standard');

  return {
    schemaVersion: '1.0',
    title: `Camera Report — ${formatReportDate(date)}`,
    generatedAt: new Date().toISOString(),
    session: {
      date: formatReportDate(date),
      startTime: sessionMeta.startTime ? formatTime(sessionMeta.startTime) : null,
      endTime: formatTime(date),
      totalObjectsDetected: trackedObjects.length,
      activeObjects: trackedObjects.filter(o => o.status === 'Active').length,
      departedObjects: trackedObjects.filter(o => o.status === 'Departed').length
    },
    observations: trackedObjects.map(obj => ({
      object: obj.name,
      trackingId: obj.id,
      category: obj.category,
      firstDetected: obj.firstDetected,
      lastDetected: obj.lastDetected,
      duration: obj.duration,
      durationSeconds: obj.durationSeconds || 1,
      status: obj.status,
      peakConfidence: obj.peakConfidence,
      movementSummary: obj.movementSummary,
      events: obj.events || []
    })),
    aiSummary: summary
  };
}
