"use client";

import { FormEvent, useEffect, useState } from "react";

type Overview = { users: number; salons: number; bookings: number; revenue: number };
type Session = { token: string; user: { name?: string | null; email?: string | null; role: string } };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const initialOverview: Overview = { users: 0, salons: 0, bookings: 0, revenue: 0 };

export default function Dashboard() {
  const [overview, setOverview] = useState(initialOverview);
  const [token, setToken] = useState("");
  const [identifier, setIdentifier] = useState("admin@salonathome.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("salon_at_home_admin_token");
    if (storedToken) {
      setToken(storedToken);
      void loadOverview(storedToken);
    }
  }, []);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const body = await response.json().catch(() => null) as ({ error?: string } & T) | null;
    if (!response.ok) throw new Error(body?.error ?? "Request failed");
    return body as T;
  }

  async function loadOverview(adminToken: string) {
    try {
      setError("");
      setOverview(await request<Overview>("/admin/overview", { headers: { Authorization: `Bearer ${adminToken}` } }));
    } catch (loadError) {
      window.localStorage.removeItem("salon_at_home_admin_token");
      setToken("");
      setError(loadError instanceof Error ? loadError.message : "Could not load dashboard");
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await request<Session>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
      if (session.user.role !== "ADMIN") throw new Error("This console is restricted to administrators");
      window.localStorage.setItem("salon_at_home_admin_token", session.token);
      setToken(session.token);
      await loadOverview(session.token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    window.localStorage.removeItem("salon_at_home_admin_token");
    setToken("");
    setOverview(initialOverview);
  }

  if (!token) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <p className="eyebrow">SALON AT HOME // PLATFORM OPS</p>
          <h1>Command center access.</h1>
          <p className="muted">Sign in with the seeded administrator account to monitor MVP operations.</p>
          <form onSubmit={login}>
            <label>EMAIL OR PHONE<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></label>
            <label>PASSWORD<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error && <p className="error">{error}</p>}
            <button disabled={loading}>{loading ? "AUTHENTICATING..." : "ENTER CONSOLE"}</button>
          </form>
        </section>
      </main>
    );
  }

  const metrics = [
    ["TOTAL USERS", overview.users.toLocaleString("en-IN")],
    ["VERIFIED SALONS", overview.salons.toLocaleString("en-IN")],
    ["BOOKINGS", overview.bookings.toLocaleString("en-IN")],
    ["PAID REVENUE", `INR ${overview.revenue.toLocaleString("en-IN")}`],
  ];

  return (
    <main className="dashboard">
      <aside>
        <div><p className="eyebrow">SALON AT HOME</p><h2>OPS // 01</h2></div>
        <nav><a className="active">Overview</a><a>Users</a><a>Salons</a><a>Bookings</a><a>Payments</a></nav>
        <button className="ghost" onClick={logout}>LOGOUT</button>
      </aside>
      <section className="content">
        <header><div><p className="eyebrow">PLATFORM OPS // ADMIN</p><h1>Command Center</h1><p className="muted">Live MVP health and transaction visibility.</p></div><span className="status">SYSTEM ONLINE</span></header>
        <div className="metric-grid">{metrics.map(([label, value]) => <article className="metric" key={label}><p>{label}</p><strong>{value}</strong></article>)}</div>
        <section className="activity">
          <p className="eyebrow">SETUP STATUS</p>
          <h3>Core modules connected</h3>
          {["JWT authentication and OTP email flow", "Salon and service management", "Booking lifecycle controls", "Razorpay order verification", "PostgreSQL persistence with Prisma"].map((item) => <div className="activity-row" key={item}><span>+</span><p>{item}</p><b>READY</b></div>)}
        </section>
      </section>
    </main>
  );
}
