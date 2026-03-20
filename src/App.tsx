import { BrowserRouter, Routes, Route } from "react-router-dom"
import Dashboard from "./components/Dashboard"
import Editor from "./components/Editor"
import Settings from "./components/Settings"
import styles from "./App.module.scss"

function App() {
  return (
    <BrowserRouter>
      <div className={styles.root}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/edit/:id" element={<Editor />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
