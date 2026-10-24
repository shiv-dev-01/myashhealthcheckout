import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Checkout2, ErrorPage, SuccessPage } from "./pages";
import NewThankyouPage from "./pages/NewThankyouPage";

const App = () => {
  return (
    <>
      <BrowserRouter>
        {/* <Navbar /> */}

        <Routes>
          <Route path="/thankyou-page" element={<NewThankyouPage />} />
          <Route path="/SuccessPage" element={<SuccessPage />} />
          <Route path="/ErrorPage" element={<ErrorPage />} />
          <Route path="*" element={<ErrorPage />} />
          <Route path="/" element={<Checkout2 />} />
        </Routes>
        {/* <Footer /> */}
      </BrowserRouter>
    </>
  );
};

export default App;
