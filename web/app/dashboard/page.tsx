import { Dashboard } from "./Dashboard";
import { DASHBOARD_FONT_CLASS } from "./fonts";

export default function LiveDashboardPage(): React.ReactElement {
  return <Dashboard fontClassName={DASHBOARD_FONT_CLASS} mode="live" />;
}
