import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import StudentDashboard from './pages/StudentDashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/student" element={<StudentDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App