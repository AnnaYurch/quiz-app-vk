import { Link, useNavigate } from 'react-router-dom'

function Navbar() {
  const navigate = useNavigate()
  const rawUser = localStorage.getItem('user')
  const token = localStorage.getItem('token')

  let user = null

  try {
    user = rawUser ? JSON.parse(rawUser) : null
  } catch (error) {
    user = null
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/')
  }

  const isAuthenticated = Boolean(token && user)
  const isOrganizer = user?.role === 'ORGANIZER'

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 lg:px-6">
        <Link to="/" className="text-sm font-semibold uppercase tracking-[0.35em] text-sky-300/90">
          VK Quiz MVP
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          {!isAuthenticated ? (
            <>
              <Link
                to="/login"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Войти
              </Link>
              <Link
                to="/"
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-100"
              >
                Присоединиться
              </Link>
            </>
          ) : isOrganizer ? (
            <>
              <Link
                to="/organizer/history"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Мои квизы
              </Link>
              <Link
                to="/organizer"
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-100"
              >
                Создать квиз
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link
                to="/"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Присоединиться
              </Link>
              <Link
                to="/participant/history"
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-100"
              >
                Мои квизы
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Выйти
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

export default Navbar