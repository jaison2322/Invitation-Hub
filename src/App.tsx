import { useEffect, useRef, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAppStore } from './store/useAppStore';
import {
  LayoutDashboard, Calendar, ScanLine, Users, Settings,
} from 'lucide-react';

// Screens
import SplashScreen from './routes/SplashScreen';
import LoginScreen from './routes/LoginScreen';
import DashboardScreen from './routes/DashboardScreen';
import ScanInvitationScreen from './routes/ScanInvitationScreen';
import AIProcessingScreen from './routes/AIProcessingScreen';
import ExtractedDetailsScreen from './routes/ExtractedDetailsScreen';
import ConfirmIgnoreScreen from './routes/ConfirmIgnoreScreen';
import UpcomingInvitationsScreen from './routes/UpcomingInvitationsScreen';
import CalendarScreen from './routes/CalendarScreen';
import EventDetailScreen from './routes/EventDetailScreen';
import PersonProfileScreen from './routes/PersonProfileScreen';
import PastFamilyFunctionsScreen from './routes/PastFamilyFunctionsScreen';
import PastEventDetailScreen from './routes/PastEventDetailScreen';
import GiftHistoryScreen from './routes/GiftHistoryScreen';
import AddEditEventScreen from './routes/AddEditEventScreen';
import AddInvitationScreen from './routes/AddInvitationScreen';
import ReminderCenterScreen from './routes/ReminderCenterScreen';
import ScheduleConflictScreen from './routes/ScheduleConflictScreen';
import PrivilegedUsersScreen from './routes/PrivilegedUsersScreen';
import PermissionManagementScreen from './routes/PermissionManagementScreen';
import NotificationsScreen from './routes/NotificationsScreen';
import ActivityHistoryScreen from './routes/ActivityHistoryScreen';
import SettingsScreen from './routes/SettingsScreen';
import StaffRequestsScreen from './routes/StaffRequestsScreen';
import PeopleListScreen from './routes/PeopleListScreen';
import WaitingApprovalScreen from './routes/WaitingApprovalScreen';
import ApprovalRejectedScreen from './routes/ApprovalRejectedScreen';

import { realtimeService } from './services/realtimeService';
import { mobileNotificationService } from './services/mobileNotificationService';
import AppHeader from './components/AppHeader';
import { useTranslation } from './i18n/useTranslation';

// ─── Protected Route ────────────────────────────────────────────────────────
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isVIP, currentPrivilegedUser } = useAppStore();

  if (!isAuthenticated) {
    if (currentPrivilegedUser) {
      if (currentPrivilegedUser.approvalStatus === 'PENDING_APPROVAL') {
        return <Navigate to="/waiting-approval" replace />;
      }
      if (currentPrivilegedUser.approvalStatus === 'REJECTED') {
        return <Navigate to="/approval-rejected" replace />;
      }
    }
    return <Navigate to="/login" replace />;
  }

  // If authenticated but is a staff user with pending or rejected status
  if (!isVIP && currentPrivilegedUser) {
    if (currentPrivilegedUser.approvalStatus === 'PENDING_APPROVAL') {
      return <Navigate to="/waiting-approval" replace />;
    }
    if (currentPrivilegedUser.approvalStatus === 'REJECTED') {
      return <Navigate to="/approval-rejected" replace />;
    }
  }

  return <>{children}</>;
}

// ─── Bottom Navigation ──────────────────────────────────────────────────────
function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { getUnreadCount } = useAppStore();
  const { t } = useTranslation();

  // Pages that should NOT show bottom nav
  const hideNavPages = [
    '/', '/login', '/waiting-approval', '/approval-rejected',
    '/ai-processing', '/extracted-details', '/confirm-ignore', '/add-invitation',
  ];

  // Also hide on detail pages
  const isDetailPage = location.pathname.startsWith('/event/') ||
    location.pathname.startsWith('/person/') ||
    location.pathname.startsWith('/past-event/') ||
    location.pathname.startsWith('/permissions/') ||
    location.pathname === '/notifications' ||
    location.pathname === '/activity' ||
    location.pathname === '/privileged-users' ||
    location.pathname === '/staff-requests' ||
    location.pathname === '/reminders' ||
    location.pathname === '/conflicts' ||
    location.pathname === '/add-event' ||
    location.pathname.startsWith('/edit-event/') ||
    location.pathname === '/add-invitation';

  if (hideNavPages.includes(location.pathname) || isDetailPage) return null;

  const unread = getUnreadCount();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bottom-nav" aria-label="Main Navigation">
      <button
        type="button"
        className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}
        onClick={() => navigate('/dashboard')}
        aria-label="Home"
        style={{ background: 'none', border: 'none' }}
      >
        <LayoutDashboard size={20} strokeWidth={1.8} />
        <span className="nav-item-label">{t('nav.briefing')}</span>
      </button>

      <button
        type="button"
        className={`nav-item ${isActive('/upcoming') ? 'active' : ''}`}
        onClick={() => navigate('/upcoming')}
        aria-label="Events"
        style={{ background: 'none', border: 'none' }}
      >
        <Calendar size={20} strokeWidth={1.8} />
        <span className="nav-item-label">{t('nav.events')}</span>
        {unread > 0 && <span className="nav-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      <button
        type="button"
        className={`nav-scan-btn ${isActive('/scan') ? 'active' : ''}`}
        onClick={() => navigate('/scan')}
        aria-label="Scan Invitation"
        title="Scan Invitation"
      >
        <ScanLine size={20} strokeWidth={2.2} />
      </button>

      <button
        type="button"
        className={`nav-item ${isActive('/people') ? 'active' : ''}`}
        onClick={() => navigate('/people')}
        aria-label="Contacts"
        style={{ background: 'none', border: 'none' }}
      >
        <Users size={20} strokeWidth={1.8} />
        <span className="nav-item-label">{t('nav.contacts')}</span>
      </button>

      <button
        type="button"
        className={`nav-item ${isActive('/settings') ? 'active' : ''}`}
        onClick={() => navigate('/settings')}
        aria-label="Settings"
        style={{ background: 'none', border: 'none' }}
      >
        <Settings size={20} strokeWidth={1.8} />
        <span className="nav-item-label">{t('nav.settings')}</span>
      </button>
    </nav>
  );
}

// ─── Android Hardware Back Button & Gesture Handler ─────────────────────────
function AndroidBackButtonHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let isMounted = true;
    let removeListener: (() => void) | undefined;

    CapApp.addListener('backButton', ({ canGoBack }) => {
      const currentPath = locationRef.current.pathname;
      const rootPaths = ['/dashboard', '/login', '/', '/waiting-approval', '/approval-rejected'];
      const isRootScreen = rootPaths.includes(currentPath);

      if (isRootScreen) {
        // User is on root/home screen: allow normal Android behavior to exit/minimize
        CapApp.exitApp();
      } else if (canGoBack || (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0)) {
        // Previous screen exists in navigation stack: pop back to it
        navigate(-1);
      } else {
        // Fallback for cold start on sub-screen without history: navigate safely to home
        navigate('/dashboard', { replace: true });
      }
    }).then((handle) => {
      if (isMounted) {
        removeListener = () => handle.remove();
      } else {
        handle.remove();
      }
    });

    return () => {
      isMounted = false;
      if (removeListener) removeListener();
    };
  }, [navigate]);

  return null;
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { isAuthenticated, currentUser, currentPrivilegedUser, activeVipId } = useAppStore();

  useEffect(() => {
    // Initialize PWA / mobile notification service worker and channel
    mobileNotificationService.init();

    // Automatically request notification permission on first app launch (guarded against repeat triggers)
    mobileNotificationService.requestFirstLaunchPermission().catch((err) => {
      console.warn('[VIP App] First-launch permission request non-blocking error:', err);
    });

    const store = useAppStore.getState();
    const activeUser = store.currentUser?.username || store.currentPrivilegedUser?.username;
    const vipId = store.activeVipId || store.currentUser?.vipId || store.currentPrivilegedUser?.vipId;

    let unsubscribe = () => {};

    if (store.isAuthenticated && vipId) {
      if (activeUser) {
        mobileNotificationService.registerDevice(activeUser, vipId).catch(console.warn);
      }
      store.syncWithSupabase(vipId);
      unsubscribe = realtimeService.subscribeAll(vipId);

      // Catch up on any recent unread notifications missed while offline/closed/locked
      if (activeUser) {
        mobileNotificationService.checkRecentUnreadNotifications(activeUser, vipId).catch(console.warn);
      }
    }

    // Automatic re-synchronization when app becomes active, regains focus, or reconnects to the network
    const handleReactivation = () => {
      console.log('[VIP Sync] Device active/online: synchronizing latest state from Supabase...');
      const latestStore = useAppStore.getState();
      if (!latestStore.isAuthenticated) return;
      const currentVipId = latestStore.activeVipId || latestStore.currentUser?.vipId || latestStore.currentPrivilegedUser?.vipId;
      if (currentVipId) {
        latestStore.syncWithSupabase(currentVipId);
        const currentActive = latestStore.currentUser?.username || latestStore.currentPrivilegedUser?.username;
        if (currentActive) {
          mobileNotificationService.checkRecentUnreadNotifications(currentActive, currentVipId).catch(console.warn);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleReactivation();
      }
    };

    window.addEventListener('online', handleReactivation);
    window.addEventListener('focus', handleReactivation);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('resume', handleReactivation);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleReactivation);
      window.removeEventListener('focus', handleReactivation);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('resume', handleReactivation);
    };
  }, []);

  return (
    <BrowserRouter>
      <AndroidBackButtonHandler />
      <div className="app-shell">
        <div className="status-bar-scrim" aria-hidden="true" />
        <AppHeader />
        <div className="app-container">
          <Routes>
            {/* Public / Auth Gate Screens */}
            <Route path="/" element={<SplashScreen />} />
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/waiting-approval" element={<WaitingApprovalScreen />} />
            <Route path="/approval-rejected" element={<ApprovalRejectedScreen />} />
            <Route path="/verify-phone" element={<Navigate to="/dashboard" replace />} />

            {/* Protected — Core Flow */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardScreen /></ProtectedRoute>} />
            <Route path="/scan" element={<ProtectedRoute><ScanInvitationScreen /></ProtectedRoute>} />
            <Route path="/ai-processing" element={<ProtectedRoute><AIProcessingScreen /></ProtectedRoute>} />
            <Route path="/extracted-details" element={<ProtectedRoute><ExtractedDetailsScreen /></ProtectedRoute>} />
            <Route path="/confirm-ignore" element={<ProtectedRoute><ConfirmIgnoreScreen /></ProtectedRoute>} />

            {/* Protected — Event & People */}
            <Route path="/upcoming" element={<ProtectedRoute><UpcomingInvitationsScreen /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><CalendarScreen /></ProtectedRoute>} />
            <Route path="/event/:id" element={<ProtectedRoute><EventDetailScreen /></ProtectedRoute>} />
            <Route path="/person/:id" element={<ProtectedRoute><PersonProfileScreen /></ProtectedRoute>} />
            <Route path="/people" element={<ProtectedRoute><PeopleListScreen /></ProtectedRoute>} />

            {/* Protected — Past Events & Gifts */}
            <Route path="/past-events" element={<ProtectedRoute><PastFamilyFunctionsScreen /></ProtectedRoute>} />
            <Route path="/past-event/:id" element={<ProtectedRoute><PastEventDetailScreen /></ProtectedRoute>} />
            <Route path="/gifts" element={<ProtectedRoute><GiftHistoryScreen /></ProtectedRoute>} />
            <Route path="/add-event" element={<ProtectedRoute><AddEditEventScreen /></ProtectedRoute>} />
            <Route path="/edit-event/:id" element={<ProtectedRoute><AddEditEventScreen /></ProtectedRoute>} />
            <Route path="/add-invitation" element={<ProtectedRoute><AddInvitationScreen /></ProtectedRoute>} />

            {/* Protected — Management */}
            <Route path="/conflicts" element={<ProtectedRoute><ScheduleConflictScreen /></ProtectedRoute>} />
            <Route path="/reminders" element={<ProtectedRoute><ReminderCenterScreen /></ProtectedRoute>} />
            <Route path="/privileged-users" element={<ProtectedRoute><PrivilegedUsersScreen /></ProtectedRoute>} />
            <Route path="/settings/privileged-users" element={<Navigate to="/privileged-users" replace />} />
            <Route path="/staff-requests" element={<ProtectedRoute><StaffRequestsScreen /></ProtectedRoute>} />
            <Route path="/settings/staff-requests" element={<Navigate to="/staff-requests" replace />} />
            <Route path="/privileged-requests" element={<Navigate to="/staff-requests" replace />} />
            <Route path="/permissions/:id" element={<ProtectedRoute><PermissionManagementScreen /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationsScreen /></ProtectedRoute>} />
            <Route path="/activity" element={<ProtectedRoute><ActivityHistoryScreen /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsScreen /></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          <BottomNavigation />
        </div>
      </div>
    </BrowserRouter>
  );
}
