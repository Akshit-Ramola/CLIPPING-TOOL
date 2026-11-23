import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/streams", label: "Find streams" },
  { to: "/capture/new", label: "New capture" },
  { to: "/jobs", label: "Capture jobs" },
  { to: "/clips", label: "Clips" },
  { to: "/render", label: "Manual render" },
];

export default function Layout() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◤</span>
          <div>
            <strong>GTA Face Clipper</strong>
            <small>facecam-over-gameplay shorts</small>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-note">
          Use footage you are authorized to record, edit and publish. Nothing is posted without your explicit action.
        </p>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
