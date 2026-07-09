import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/AuthContext'
import { RequireAuth } from './features/auth/RequireAuth'
import { RequireRole } from './features/auth/RequireRole'
import { LoginPage } from './features/auth/LoginPage'
import { AppLayout } from './components/layout/AppLayout'
import { AxesOverviewPage } from './features/dashboard/AxesOverviewPage'
import { AxisDashboardPage } from './features/dashboard/AxisDashboardPage'
import { LevelDashboardPage } from './features/dashboard/LevelDashboardPage'
import { GlobalExceptionsPage } from './features/dashboard/GlobalExceptionsPage'
import { IndicatorsListPage } from './features/indicators/IndicatorsListPage'
import { IndicatorFormPage } from './features/indicators/IndicatorFormPage'
import { MeasurementCapturePage } from './features/measurements/MeasurementCapturePage'
import { CaptureCompliancePage } from './features/measurements/CaptureCompliancePage'
import { CascadeViewPage } from './features/cascade/CascadeViewPage'
import { CausalAnalysisPage } from './features/causal-analysis/CausalAnalysisPage'
import { ParetoPage } from './features/pareto/ParetoPage'
import { IndicatorBoardPage } from './features/indicator-board/IndicatorBoardPage'
import { OrgStructurePage } from './features/org-structure/OrgStructurePage'
import { OrgResultsPage } from './features/org-structure/OrgResultsPage'
import { NewOrganizationPage } from './features/onboarding/NewOrganizationPage'
import { LinkUserPage } from './features/onboarding/LinkUserPage'

const INDICATOR_MANAGER_ROLES = ['admin_consultora', 'admin_cliente', 'gerente', 'administrativo'] as const
const MANAGEMENT_ROLES = ['admin_consultora', 'admin_cliente', 'gerente'] as const
const ONBOARDING_ROLES = ['admin_consultora', 'admin_cliente'] as const

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index element={<AxesOverviewPage />} />
              <Route path="ejes/:axisId" element={<AxisDashboardPage />} />
              <Route path="niveles/:level" element={<LevelDashboardPage />} />
              <Route path="captura" element={<MeasurementCapturePage />} />
              <Route path="cascada/:indicatorId" element={<CascadeViewPage />} />
              <Route path="tablero/:indicatorId" element={<IndicatorBoardPage />} />
              <Route path="analisis-causal/:indicatorId" element={<CausalAnalysisPage />} />

              <Route element={<RequireRole allowed={[...INDICATOR_MANAGER_ROLES]} />}>
                <Route path="indicadores" element={<IndicatorsListPage />} />
                <Route path="indicadores/nuevo" element={<IndicatorFormPage />} />
                <Route path="indicadores/:id/editar" element={<IndicatorFormPage />} />
                <Route path="cumplimiento-captura" element={<CaptureCompliancePage />} />
                <Route path="pareto" element={<ParetoPage />} />
              </Route>

              <Route element={<RequireRole allowed={[...MANAGEMENT_ROLES]} />}>
                <Route path="panorama-global" element={<GlobalExceptionsPage />} />
                <Route path="estructura-organizacional" element={<OrgStructurePage />} />
                <Route path="resultados-organizacion" element={<OrgResultsPage />} />
              </Route>

              <Route element={<RequireRole allowed={['admin_consultora']} />}>
                <Route path="nuevo-cliente" element={<NewOrganizationPage />} />
              </Route>

              <Route element={<RequireRole allowed={[...ONBOARDING_ROLES]} />}>
                <Route path="vincular-usuario" element={<LinkUserPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
