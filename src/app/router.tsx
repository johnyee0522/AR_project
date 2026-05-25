import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import Main from "./routes/main";

export default function Router() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/main" element={<Main />} />
        <Route path="*" element={<Navigate to="/main" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
