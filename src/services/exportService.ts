import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import type {
  Invitation,
  Person,
  ScheduleItem,
  FamilyEvent,
  PrivilegedUser,
  VIPUser,
} from '../types';
import {
  getPriorityLabel,
  getStatusLabel,
  getEventTypeLabel,
  getRelationshipLabel,
  getGiftCategoryLabel,
  formatDate,
  formatTime,
  getLocalTodayDateString,
} from '../utils/formatters';
import { NativeAppPermissions } from './permissionService';

export interface ExportUpcomingParams {
  invitations: Invitation[];
  people: Person[];
}

export interface ExportUpcomingResult {
  success: boolean;
  filename?: string;
  count?: number;
  reason?: 'NO_UPCOMING_EVENTS' | 'ERROR';
  summary?: string;
  error?: string;
}

/**
 * Checks whether an event is in the future based on date and time.
 */
export function isEventInFuture(inv: { date?: string; time?: string }, now: Date = new Date()): boolean {
  if (!inv || !inv.date) return false;

  const todayStr = getLocalTodayDateString();
  const datePart = inv.date.includes('T') ? inv.date.split('T')[0] : inv.date.trim();

  // Strictly in the past calendar day
  if (datePart < todayStr) {
    return false;
  }

  // Strictly future calendar day
  if (datePart > todayStr) {
    return true;
  }

  // Event is today: check time if available
  if (!inv.time) {
    return true;
  }

  try {
    const timeStr = inv.time.trim();
    let hours = 0;
    let minutes = 0;
    const isPM = /pm/i.test(timeStr);
    const isAM = /am/i.test(timeStr);
    const cleanTime = timeStr.replace(/(am|pm)/i, '').trim();
    const parts = cleanTime.split(':').map((p) => parseInt(p, 10));

    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      hours = parts[0];
      minutes = parts[1];
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;

      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();

      if (hours < currentHours || (hours === currentHours && minutes < currentMinutes)) {
        return false;
      }
    }
  } catch {
    return true;
  }

  return true;
}

/**
 * Formats event time into a clean 12-hour AM/PM string.
 */
function formatEventTime(timeStr?: string): string {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  if (/am|pm/i.test(trimmed)) return trimmed;
  return formatTime(trimmed);
}

export interface UpcomingExportRow {
  'Host Name': string;
  'Contact Details': string;
  'Event Category': string;
  'Event Details': string;
  'Event Date': string;
  'Event Time': string;
  'Venue': string;
  'Location': string;
}

export const UPCOMING_EXPORT_HEADERS = [
  'Host Name',
  'Contact Details',
  'Event Category',
  'Event Details',
  'Event Date',
  'Event Time',
  'Venue',
  'Location',
] as const;

/**
 * Extracts and maps the canonical upcoming events export rows.
 * Shared as the single source of truth for both Excel and PDF exports.
 */
export function getUpcomingExportRows({
  invitations = [],
  people = [],
}: ExportUpcomingParams): UpcomingExportRow[] {
  // 1. Filter only future upcoming events and exclude ignored events
  const upcomingInvitations = invitations
    .filter((inv) => inv.status !== 'ignored' && isEventInFuture(inv))
    .sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.time || '').localeCompare(b.time || '');
    });

  if (upcomingInvitations.length === 0) {
    return [];
  }

  // 2. Map to required exact columns
  return upcomingInvitations.map((inv) => {
    const person = inv.personId
      ? people.find((p) => p.id === inv.personId)
      : (inv.hostName ? people.find((p) => p.name.toLowerCase() === inv.hostName!.toLowerCase()) : null);

    const hostName = inv.hostName?.trim() || person?.name?.trim() || '';
    const contactDetails = person?.phone?.trim() || person?.email?.trim() || '';
    const eventCategory = getEventTypeLabel(inv.eventType);

    // Resolve event title accurately: prioritize descriptive nickname/title over generic eventType
    let eventDetails = '';
    if (inv.nickname && inv.nickname.trim() && inv.nickname.trim().toLowerCase() !== inv.eventType?.toLowerCase()) {
      eventDetails = inv.nickname.trim();
    } else if (inv.title && inv.title.trim() && inv.title.trim().toLowerCase() !== inv.eventType?.toLowerCase()) {
      eventDetails = inv.title.trim();
    } else if (inv.nickname && inv.nickname.trim()) {
      eventDetails = inv.nickname.trim();
    } else if (inv.title && inv.title.trim()) {
      eventDetails = inv.title.trim();
    } else if ((inv as any).eventTitle) {
      eventDetails = String((inv as any).eventTitle).trim();
    } else if ((inv as any).name) {
      eventDetails = String((inv as any).name).trim();
    } else if (inv.hostName?.trim()) {
      eventDetails = `${inv.hostName.trim()}'s ${eventCategory}`;
    } else {
      eventDetails = eventCategory;
    }

    let formattedDate = '';
    try {
      if (inv.date) {
        formattedDate = format(parseISO(inv.date), 'd MMM yyyy');
      }
    } catch {
      formattedDate = inv.date || '';
    }

    const formattedTimeStr = formatEventTime(inv.time);
    const venue = inv.venue?.trim() || '';
    const location = inv.location?.trim() || '';

    return {
      'Host Name': hostName,
      'Contact Details': contactDetails,
      'Event Category': eventCategory,
      'Event Details': eventDetails,
      'Event Date': formattedDate,
      'Event Time': formattedTimeStr,
      'Venue': venue,
      'Location': location,
    };
  });
}

/**
 * Exports ONLY upcoming events into a clean, formatted .xlsx file.
 */
export async function exportUpcomingEventsToExcel({
  invitations = [],
  people = [],
}: ExportUpcomingParams): Promise<ExportUpcomingResult> {
  try {
    const rows = getUpcomingExportRows({ invitations, people });

    if (rows.length === 0) {
      return {
        success: false,
        reason: 'NO_UPCOMING_EVENTS',
        summary: 'No upcoming events available to export.',
      };
    }

    // Create workbook with the single sheet of upcoming events
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: [...UPCOMING_EXPORT_HEADERS],
    });

    // 5. Calculate column widths
    ws['!cols'] = [
      { wch: Math.max(16, ...rows.map((r) => String(r['Host Name'] || '').length + 3)) },
      { wch: Math.max(18, ...rows.map((r) => String(r['Contact Details'] || '').length + 3)) },
      { wch: Math.max(18, ...rows.map((r) => String(r['Event Category'] || '').length + 3)) },
      { wch: Math.max(24, ...rows.map((r) => String(r['Event Details'] || '').length + 3)) },
      { wch: Math.max(16, ...rows.map((r) => String(r['Event Date'] || '').length + 3)) },
      { wch: Math.max(14, ...rows.map((r) => String(r['Event Time'] || '').length + 3)) },
      { wch: Math.max(18, ...rows.map((r) => String(r['Venue'] || '').length + 3)) },
      { wch: Math.max(22, ...rows.map((r) => String(r['Location'] || '').length + 3)) },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Upcoming Events');

    // 6. Deliver file
    const filename = 'Invitation_Hub_Upcoming_Events.xlsx';
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // A. Native Android / Mobile via AppPermissionsPlugin
    if (Capacitor.isNativePlatform()) {
      try {
        const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const nativeRes = await NativeAppPermissions.saveFileToDownloads({
          filename,
          base64Data,
          mimeType,
        });

        if (nativeRes && nativeRes.success) {
          return {
            success: true,
            filename,
            count: rows.length,
            summary: 'Upcoming events exported successfully.',
          };
        }
      } catch (nativeErr: any) {
        console.warn('Native download failed, trying browser fallback:', nativeErr);
      }
    }

    // B. Browser Blob / Web Share fallback
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: mimeType });

    // Try Web Share API on mobile browsers
    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Upcoming Events',
            text: 'Invitation Hub Upcoming Events Export',
            files: [file],
          });
          return {
            success: true,
            filename,
            count: rows.length,
            summary: 'Upcoming events exported successfully.',
          };
        }
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') {
          return {
            success: true,
            filename,
            count: rows.length,
            summary: 'Upcoming events exported successfully.',
          };
        }
        console.warn('Share API fallback to direct download:', shareErr);
      }
    }

    // Direct Browser Download via anchor
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    return {
      success: true,
      filename,
      count: rows.length,
      summary: 'Upcoming events exported successfully.',
    };
  } catch (error: any) {
    console.error('Error exporting upcoming events to Excel:', error);
    return {
      success: false,
      reason: 'ERROR',
      error: error?.message || 'Failed to export upcoming events',
      summary: 'Export failed: ' + (error?.message || 'Unknown error'),
    };
  }
}

/**
 * Exports ONLY upcoming events into a clean, formatted .pdf document.
 * Consumes the exact same dataset, columns, ordering, and values as the Excel export.
 */
export async function exportUpcomingEventsToPdf({
  invitations = [],
  people = [],
}: ExportUpcomingParams): Promise<ExportUpcomingResult> {
  try {
    const rows = getUpcomingExportRows({ invitations, people });

    if (rows.length === 0) {
      return {
        success: false,
        reason: 'NO_UPCOMING_EVENTS',
        summary: 'No upcoming events available to export.',
      };
    }

    // Initialize landscape A4 document
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Document Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(24, 24, 28);
    doc.text('Invitation Hub — Upcoming Events Registry', 14, 15);

    // 2. Subtitle & Metadata
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 120);
    const exportTimeStr = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.text(`Generated on: ${exportTimeStr}   |   Total Events: ${rows.length}`, 14, 21);

    // 3. Gold Accent Rule
    doc.setDrawColor(212, 175, 55); // VIP Gold
    doc.setLineWidth(0.6);
    doc.line(14, 24, pageWidth - 14, 24);

    // 4. Table Columns & Body (Identical columns and ordering to Excel)
    const headers = [...UPCOMING_EXPORT_HEADERS];
    const bodyData = rows.map((r) => [
      r['Host Name'] || '—',
      r['Contact Details'] || '—',
      r['Event Category'] || '—',
      r['Event Details'] || '—',
      r['Event Date'] || '—',
      r['Event Time'] || '—',
      r['Venue'] || '—',
      r['Location'] || '—',
    ]);

    autoTable(doc, {
      head: [headers],
      body: bodyData,
      startY: 28,
      margin: { left: 14, right: 14, bottom: 16 },
      showHead: 'everyPage', // Repeat table header on every page
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 3.5,
        overflow: 'linebreak',
        valign: 'middle',
        textColor: [35, 35, 40],
        lineColor: [225, 225, 230],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [24, 24, 28], // Dark Executive Header
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'left',
        lineWidth: 0.2,
        lineColor: [40, 40, 45],
      },
      alternateRowStyles: {
        fillColor: [249, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 32 }, // Host Name
        1: { cellWidth: 28 }, // Contact Details
        2: { cellWidth: 26 }, // Event Category
        3: { cellWidth: 48 }, // Event Details
        4: { cellWidth: 25 }, // Event Date
        5: { cellWidth: 22 }, // Event Time
        6: { cellWidth: 42 }, // Venue
        7: { cellWidth: 46 }, // Location
      },
    });

    // 5. Running Footer with Page Numbers on all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 150);
      doc.text(
        `Page ${i} of ${totalPages}`,
        pageWidth - 14,
        pageHeight - 8,
        { align: 'right' }
      );
      doc.text(
        'Confidential Protocol Registry — Invitation Hub',
        14,
        pageHeight - 8
      );
    }

    // 6. Deliver file
    const filename = 'Invitation_Hub_Upcoming_Events.pdf';
    const mimeType = 'application/pdf';

    // A. Native Android / Mobile via AppPermissionsPlugin
    if (Capacitor.isNativePlatform()) {
      try {
        const base64Data = doc.output('datauristring').split(',')[1];
        const nativeRes = await NativeAppPermissions.saveFileToDownloads({
          filename,
          base64Data,
          mimeType,
        });

        if (nativeRes && nativeRes.success) {
          return {
            success: true,
            filename,
            count: rows.length,
            summary: 'Upcoming events exported to PDF successfully.',
          };
        }
      } catch (nativeErr: any) {
        console.warn('Native PDF download failed, trying browser fallback:', nativeErr);
      }
    }

    // B. Browser Blob / Web Share fallback
    const pdfBlob = doc.output('blob');

    // Try Web Share API on mobile browsers
    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      try {
        const file = new File([pdfBlob], filename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Upcoming Events',
            text: 'Invitation Hub Upcoming Events Export',
            files: [file],
          });
          return {
            success: true,
            filename,
            count: rows.length,
            summary: 'Upcoming events exported to PDF successfully.',
          };
        }
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') {
          return {
            success: true,
            filename,
            count: rows.length,
            summary: 'Upcoming events exported to PDF successfully.',
          };
        }
        console.warn('Share API fallback to direct download:', shareErr);
      }
    }

    // Direct Browser Download via anchor
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    return {
      success: true,
      filename,
      count: rows.length,
      summary: 'Upcoming events exported to PDF successfully.',
    };
  } catch (error: any) {
    console.error('Error exporting upcoming events to PDF:', error);
    return {
      success: false,
      reason: 'ERROR',
      error: error?.message || 'Failed to export upcoming events to PDF',
      summary: 'Export failed: ' + (error?.message || 'Unknown error'),
    };
  }
}

interface ExportDataParams {
  invitations: Invitation[];
  people: Person[];
  schedule: ScheduleItem[];
  familyEvents: FamilyEvent[];
  privilegedUsers?: PrivilegedUser[];
  activeUser?: VIPUser | PrivilegedUser | null;
  isVIP?: boolean;
}

/**
 * Calculates optimal column widths based on cell content length
 */
function calculateColumnWidths(data: Record<string, any>[]): { wch: number }[] {
  if (!data || data.length === 0) return [];
  const keys = Object.keys(data[0]);
  return keys.map((key) => {
    let maxLen = key.length;
    for (const row of data) {
      const val = row[key];
      if (val !== undefined && val !== null) {
        const strLen = String(val).length;
        if (strLen > maxLen) {
          maxLen = Math.min(strLen, 60); // Cap width to prevent overly wide columns
        }
      }
    }
    return { wch: Math.max(maxLen + 4, 14) };
  });
}

/**
 * Exports all application data into a beautifully formatted Microsoft Excel (.xlsx) workbook.
 */
export async function exportToExcel({
  invitations = [],
  people = [],
  schedule = [],
  familyEvents = [],
  privilegedUsers = [],
  activeUser,
  isVIP = true,
}: ExportDataParams): Promise<{ success: boolean; filename: string; summary: string }> {
  try {
    const wb = XLSX.utils.book_new();
    const todayStr = new Date().toISOString().split('T')[0];
    const timestampStr = new Date().toLocaleString();

    // ── 1. Executive Summary Sheet ──────────────────────────────────────────
    const totalGifts = familyEvents.reduce(
      (sum, evt) => sum + (evt.guests?.filter((g) => g.gift || g.giftDescription)?.length || 0),
      0
    );
    const totalGiftValuation = familyEvents.reduce(
      (sum, evt) =>
        sum +
        (evt.guests?.reduce((gSum, g) => gSum + (Number(g.estimatedValue) || 0), 0) || 0),
      0
    );

    const summaryRows = [
      { Metric: 'Report Title', Value: 'Invitation Hub - Master Registry & Ledger' },
      { Metric: 'Generated On', Value: timestampStr },
      { Metric: 'Export Principal / User', Value: activeUser?.name || (isVIP ? 'VIP Principal' : 'Staff') },
      { Metric: 'Account Clearance', Value: isVIP ? 'VIP Master Account' : 'Privileged Staff' },
      { Metric: 'Total Invitations', Value: invitations.length },
      {
        Metric: 'High Priority Protocols',
        Value: invitations.filter((i) => i.priority === 'high').length,
      },
      {
        Metric: 'Confirmed Engagements',
        Value: invitations.filter((i) => i.status === 'confirmed').length,
      },
      {
        Metric: 'Pending Protocols',
        Value: invitations.filter((i) => i.status === 'pending').length,
      },
      { Metric: 'Total Contacts in Registry', Value: people.length },
      { Metric: 'Upcoming Schedule Engagements', Value: schedule.length },
      { Metric: 'Total Recorded Family Events', Value: familyEvents.length },
      { Metric: 'Total Recorded Gifts in Ledger', Value: totalGifts },
      {
        Metric: 'Estimated Total Gift Valuation',
        Value: `₹${totalGiftValuation.toLocaleString('en-IN')}`,
      },
    ];

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = calculateColumnWidths(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

    // ── 2. Invitations & Protocols Sheet ────────────────────────────────────
    if (invitations.length > 0) {
      const invitationRows = invitations.map((inv) => ({
        'Event Title': inv.nickname || inv.title || 'Untitled Event',
        'Event Type': getEventTypeLabel(inv.eventType),
        'Host / Organizer': inv.hostName || '—',
        'Honoree / Key Person': inv.mainPerson || '—',
        'Date': formatDate(inv.date),
        'Raw Date (YYYY-MM-DD)': inv.date,
        'Time': inv.time ? formatTime(inv.time) : '—',
        'Venue': inv.venue || inv.location || '—',
        'Priority': getPriorityLabel(inv.priority),
        'AI Suggested Priority': inv.aiSuggestedPriority ? getPriorityLabel(inv.aiSuggestedPriority) : '—',
        'Status': getStatusLabel(inv.status),
        'AI Protocol Reason': inv.aiReason || '—',
        'Created Date': inv.createdAt ? inv.createdAt.split('T')[0] : '—',
      }));

      const wsInvitations = XLSX.utils.json_to_sheet(invitationRows);
      wsInvitations['!cols'] = calculateColumnWidths(invitationRows);
      XLSX.utils.book_append_sheet(wb, wsInvitations, 'Invitations');
    }

    // ── 3. Contacts & Registry Sheet ────────────────────────────────────────
    if (people.length > 0) {
      const contactRows = people.map((person) => ({
        'Full Name': person.name,
        'Nickname / Known As': person.nickname || '—',
        'Relationship': getRelationshipLabel(person.relationship),
        'Phone': person.phone || '—',
        'Protocol Notes': person.notes || '—',
        'Registered On': person.createdAt ? person.createdAt.split('T')[0] : '—',
      }));

      const wsContacts = XLSX.utils.json_to_sheet(contactRows);
      wsContacts['!cols'] = calculateColumnWidths(contactRows);
      XLSX.utils.book_append_sheet(wb, wsContacts, 'Contacts');
    }

    // ── 4. Schedule & Engagements Sheet ─────────────────────────────────────
    if (schedule.length > 0) {
      const scheduleRows = schedule.map((item) => ({
        'Engagement Title': item.title,
        'Date': formatDate(item.date),
        'Raw Date': item.date,
        'Start Time': item.startTime ? formatTime(item.startTime) : '—',
        'End Time': item.endTime ? formatTime(item.endTime) : '—',
        'Type': (item.type || 'event').toUpperCase(),
        'Location': item.location || '—',
        'Notes': item.notes || '—',
      }));

      const wsSchedule = XLSX.utils.json_to_sheet(scheduleRows);
      wsSchedule['!cols'] = calculateColumnWidths(scheduleRows);
      XLSX.utils.book_append_sheet(wb, wsSchedule, 'Schedule');
    }

    // ── 5. Gift Ledger & Exchanges Sheet ────────────────────────────────────
    const giftRows: Record<string, any>[] = [];
    familyEvents.forEach((event) => {
      if (event.guests && event.guests.length > 0) {
        event.guests.forEach((guest) => {
          giftRows.push({
            'Family Event': event.name,
            'Event Type': getEventTypeLabel(event.eventType),
            'Event Date': event.date,
            'Host / Principal': event.familyMember || '—',
            'Guest Name': guest.personName || '—',
            'Relationship': guest.relationship ? getRelationshipLabel(guest.relationship) : '—',
            'Attendance':
              guest.attendance === 'attended'
                ? 'Attended'
                : guest.attendance === 'invited_not_attended'
                  ? 'Invited (Absent)'
                  : 'Unknown',
            'Gift Category': guest.giftCategory ? getGiftCategoryLabel(guest.giftCategory) : '—',
            'Gift Description': guest.gift || guest.giftDescription || '—',
            'Estimated Value (₹)': guest.estimatedValue ? Number(guest.estimatedValue) : 0,
            'Notes': guest.notes || '—',
          });
        });
      }
    });

    if (giftRows.length > 0) {
      const wsGifts = XLSX.utils.json_to_sheet(giftRows);
      wsGifts['!cols'] = calculateColumnWidths(giftRows);
      XLSX.utils.book_append_sheet(wb, wsGifts, 'Gift Ledger');
    }

    // ── 6. Staff & Role Delegation Sheet ────────────────────────────────────
    if (privilegedUsers.length > 0) {
      const staffRows = privilegedUsers.map((staff) => {
        const activePermissions = Object.entries(staff.permissions || {})
          .filter(([key, allowed]) => key.startsWith('can') && allowed === true)
          .map(([key]) => key.replace(/^can/, ''))
          .join(', ');

        return {
          'Staff Name': staff.name,
          'Username': staff.username || '—',
          'Assigned Role': staff.role || 'Staff',
          'Phone': staff.phone || '—',
          'Granted Permissions': activePermissions || 'Standard Access',
          'Added Date': staff.addedAt ? staff.addedAt.split('T')[0] : '—',
        };
      });

      const wsStaff = XLSX.utils.json_to_sheet(staffRows);
      wsStaff['!cols'] = calculateColumnWidths(staffRows);
      XLSX.utils.book_append_sheet(wb, wsStaff, 'Staff & Roles');
    }

    // ── 7. Generate and Deliver File ────────────────────────────────────────
    const filename = `Invitation-Hub-${todayStr}.xlsx`;
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = new Blob([wbout], { type: mimeType });

    // Try Web Share API (native sheet on Android/iOS mobile devices)
    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Invitation Hub Master Report',
            text: `Invitation Hub Excel export generated on ${todayStr}`,
            files: [file],
          });
          return {
            success: true,
            filename,
            summary: `Successfully shared ${filename} with ${wb.SheetNames.length} sheets!`,
          };
        }
      } catch (shareErr: any) {
        // If user simply closed the share sheet, do not trigger fallback download
        if (shareErr?.name === 'AbortError') {
          return {
            success: true,
            filename,
            summary: `Export completed.`,
          };
        }
        // Otherwise continue to direct download
        console.warn('Share API fallback to direct download:', shareErr);
      }
    }

    // Direct Browser Download via anchor
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    return {
      success: true,
      filename,
      summary: `Downloaded ${filename} (${wb.SheetNames.length} sheets).`,
    };
  } catch (error: any) {
    console.error('Error exporting to Excel:', error);
    throw new Error(error?.message || 'Failed to export Excel workbook');
  }
}
