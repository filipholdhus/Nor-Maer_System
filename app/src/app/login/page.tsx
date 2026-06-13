import { LoginFormular } from "./LoginFormular";

export default async function LoginSide({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string }>;
}) {
  const { feil } = await searchParams;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#0a0a0a" }}
    >
      <div className="w-full max-w-[340px]">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div
            className="inline-flex items-center justify-center rounded font-bold text-white mb-3"
            style={{
              width: 32,
              height: 32,
              fontSize: 13,
              background: "#3b82f6",
              borderRadius: 6,
            }}
          >
            NM
          </div>
          <h1
            className="text-base font-semibold tracking-tight"
            style={{ color: "#f0f0f0" }}
          >
            Nor-Mær
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#4a4a4a" }}>
            Produksjonssystem
          </p>
        </div>

        {/* Form card */}
        <div
          className="p-6 rounded-lg"
          style={{
            background: "#111111",
            border: "1px solid #1f1f1f",
            borderRadius: 10,
          }}
        >
          <h2
            className="text-sm font-semibold mb-5"
            style={{ color: "#f0f0f0" }}
          >
            Logg inn
          </h2>
          <LoginFormular feil={feil} />
        </div>
      </div>
    </div>
  );
}
