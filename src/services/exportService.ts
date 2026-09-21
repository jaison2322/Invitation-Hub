import * as XLSX from 'xlsx';
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
} from '../utils/formatters';

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
      { Metric: 'Report Title', Value: 'VIP Event Intelligence - Master Registry & Ledger' },
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
      { Metric: 'Total VIP Contacts in Registry', Value: people.length },
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
        'Event Title': inv.title || 'Untitled Event',
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

    // ── 3. VIP Contacts & Registry Sheet ────────────────────────────────────
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
      XLSX.utils.book_append_sheet(wb, wsContacts, 'VIP Contacts');
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
    const filename = `VIP-Event-Intelligence-${todayStr}.xlsx`;
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = new Blob([wbout], { type: mimeType });

    // Try Web Share API (native sheet on Android/iOS mobile devices)
    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'VIP Event Intelligence Master Report',
            text: `VIP Intelligence Excel export generated on ${todayStr}`,
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
