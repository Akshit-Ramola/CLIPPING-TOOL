import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import FindStreams from "./pages/FindStreams.jsx";
import NewCapture from "./pages/NewCapture.jsx";
import Jobs from "./pages/Jobs.jsx";
import JobDetail from "./pages/JobDetail.jsx";
import Clips from "./pages/Clips.jsx";
import ClipDetail from "./pages/ClipDetail.jsx";
import ManualRender from "./pages/ManualRender.jsx";
import NotFound from "./pages/NotFound.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="streams" element={<FindStreams />} />
        <Route path="capture/new" element={<NewCapture />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="clips" element={<Clips />} />
        <Route path="clips/:id" element={<ClipDetail />} />
        <Route path="render" element={<ManualRender />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
