import { BrowserRouter, Routes, Route } from "react-router-dom"
import Dashboard from "./components/Dashboard"
import Editor from "./components/Editor"
import styles from "./App.module.scss"

function App() {
  return (
    <BrowserRouter>
      <div className={styles.root}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/edit/:id" element={<Editor />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
