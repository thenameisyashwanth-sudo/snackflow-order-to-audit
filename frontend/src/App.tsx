import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { getHomePathForRole, NAV_ITEMS } from './config/navigation';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminInvoicesPage from './pages/AdminInvoicesPage';
import AdminOrdersPage from './pages/AdminOrdersPage';
import AdminPaymentsPage from './pages/AdminPaymentsPage';
import AuditorReportsPage from './pages/AuditorReportsPage';
import LoginPage from './pages/LoginPage';
import InventoryStockPage from './pages/InventoryStockPage';
import OwnerDashboardPage from './pages/OwnerDashboardPage';
import ProductionRunsPage from './pages/ProductionRunsPage';
import PurchasesPage from './pages/PurchasesPage';
import { ForbiddenView, RoleModuleView } from './pages/RoleModuleView';
import SalesmanCatalogPage from './pages/SalesmanCatalogPage';
import SalesmanOrderPage from './pages/SalesmanOrderPage';
import SalesmanOrdersListPage from './pages/SalesmanOrdersListPage';
import SalesmanVisitsPage from './pages/SalesmanVisitsPage';

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-sm text-stone-600">
        Loading SnackFlow session...
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const homePath = getHomePathForRole(user.role);

  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={<Navigate to={homePath} replace />} />
        <Route path="/" element={<Navigate to={homePath} replace />} />
        {NAV_ITEMS.map((item) => {
          let element = <RoleModuleView item={item} />;
          if (item.id === 'production-runs') {
            element = <ProductionRunsPage />;
          } else if (item.id === 'purchases') {
            element = <PurchasesPage />;
          } else if (item.id === 'inventory') {
            element = <InventoryStockPage />;
          } else if (item.id === 'field-order') {
            element = <SalesmanOrderPage />;
          } else if (item.id === 'my-orders') {
            element = <SalesmanOrdersListPage />;
          } else if (item.id === 'catalog') {
            element = <SalesmanCatalogPage />;
          } else if (item.id === 'visit-log') {
            element = <SalesmanVisitsPage />;
          } else if (item.id === 'order-verification') {
            element = <AdminOrdersPage />;
          } else if (item.id === 'invoices-dispatch') {
            element = <AdminInvoicesPage />;
          } else if (item.id === 'payments') {
            element = <AdminPaymentsPage />;
          } else if (item.id === 'owner-dashboard') {
            element = <OwnerDashboardPage />;
          } else if (item.id === 'reports') {
            element = <AuditorReportsPage />;
          }

          return (
            <Route
              key={item.id}
              path={item.path}
              element={item.roles.includes(user.role) ? element : <ForbiddenView />}
            />
          );
        })}
        <Route path="*" element={<Navigate to={homePath} replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
