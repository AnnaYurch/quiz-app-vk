import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate, useSearchParams } from 'react-router-dom'

function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isRegister, setIsRegister] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'PARTICIPANT',
  })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const requestedRole = searchParams.get('role')

    if (requestedRole?.toLowerCase() === 'organizer') {
      setForm((current) => ({ ...current, role: 'ORGANIZER' }))
    }
  }, [searchParams])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (isRegister && form.password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }

    setLoading(true)

    try {
      if (isRegister) {
        await axios.post('http://localhost:3000/api/auth/register', {
          email: form.email,
          password: form.password,
          role: form.role,
          name: form.email.split('@')[0],
        })

        setSuccess('Регистрация завершена. Теперь войдите в аккаунт.')
        setIsRegister(false)
        setConfirmPassword('')
        return
      }

      // После успешного ответа сохраняем token и user в localStorage.
      const response = await axios.post('http://localhost:3000/api/auth/login', {
        email: form.email,
        password: form.password,
      })

      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))

      if (response.data.user.role === 'ORGANIZER') {
        navigate('/organizer')
        return
      }

      navigate('/')
    } catch (loginError) {
      setError(loginError?.response?.data?.message || 'Не удалось войти в аккаунт')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_40%),linear-gradient(180deg,#0f172a_0%,#111827_100%)] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <section className="w-full rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl transition-all duration-300 ease-out">
          <div className="mb-8 text-center transition-all duration-300 ease-out">
            <p className="text-sm uppercase tracking-[0.35em] text-sky-300/90">VK Quiz MVP</p>
            <h1 className="mt-3 text-3xl font-semibold">{isRegister ? 'Регистрация' : 'Вход в систему'}</h1>
            <p className="mt-2 text-sm text-slate-300">
              {isRegister
                ? 'Создай аккаунт как организатор или участник, чтобы продолжить.'
                : 'Войди как организатор или участник, чтобы продолжить.'}
            </p>
          </div>

          <form className="space-y-5 transition-all duration-300 ease-out" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Пароль</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                placeholder="••••••••"
                required
              />
            </div>

            {isRegister ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Подтвердите пароль</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                  placeholder="••••••••"
                  required={isRegister}
                />
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-medium text-slate-200">Роль</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="cursor-pointer rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-center transition has-checked:border-sky-400 has-checked:bg-sky-500/20">
                  <input
                    type="radio"
                    name="role"
                    value="ORGANIZER"
                    checked={form.role === 'ORGANIZER'}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">Я Организатор</span>
                </label>

                <label className="cursor-pointer rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-center transition has-checked:border-sky-400 has-checked:bg-sky-500/20">
                  <input
                    type="radio"
                    name="role"
                    value="PARTICIPANT"
                    checked={form.role === 'PARTICIPANT'}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">Я Участник</span>
                </label>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {success}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-linear-to-r from-sky-400 to-cyan-300 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-sky-500/30 transition hover:scale-[1.01] hover:from-sky-300 hover:to-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (isRegister ? 'Регистрируемся...' : 'Входим...') : isRegister ? 'Зарегистрироваться' : 'Войти'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsRegister((current) => !current)
                setError('')
                setSuccess('')
                setConfirmPassword('')
              }}
              className="w-full text-sm text-slate-300 transition hover:text-white"
            >
              {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

export default Login