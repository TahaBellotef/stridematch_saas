"use client";

type Props = {
  onContinue: () => void;
};

export function AnalysisCompleteStep({ onContinue }: Props) {
  return (
    <div className="w-full flex flex-col" style={{ backgroundColor: "#2D2B47",  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)", }}>
      {/* Gait Analysis Header */}
      <div style={{ height: "40px" }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          margin: "0 auto",
          width: "90%",
          maxWidth: "400px",
        }}
      >
        <h1 className="font-bold text-white" style={{ fontSize: "28px" }}>
          Gait Analysis
        </h1>
      </div>

      {/* Spacing between header and card */}
      <div style={{ height: "24px" }} />

      {/* Card Container */}
      <div
        style={{
          maxWidth: "400px",
          margin: "0 auto",
          width: "90%",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div
          style={{
            borderRadius: "20px",
            padding: "0px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            backgroundColor: "#312D4B",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div
            style={{
              position: "relative",
              borderRadius: "16px",
              overflow: "hidden",
              width: "300px",
              height: "200px",
              maxWidth: "100%",
              margin: "0 auto"
            }}
          >
            <img
              src="/images/gait-methods/congrats.png"
              alt="Analysis complete"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>

        <div style={{ textAlign: "center" }}>
          <h2 className="text-2xl font-semibold text-white" style={{ marginBottom: "6px" }}>
            Congratulations!
          </h2>
          <p className="text-base" style={{ color: "#E2E8F0" }}>
            your biomechanics scan is ready
          </p>
        </div>

          <button
            onClick={onContinue}
            style={{
              marginTop: "8px",
              width: "100%",
              padding: "14px 18px",
              borderRadius: "999px",
              fontWeight: 600,
              fontSize: "15px",
              color: "#FFFFFF",
              background: "linear-gradient(90deg, #6A47F4 0%, #8F6BFF 50%, #6A47F4 100%)",
              border: "none",
              cursor: "pointer",
              transition: "transform 0.15s ease, box-shadow 0.2s ease",
              boxShadow: "0 10px 30px rgba(106, 71, 244, 0.35)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          >
            Continue
          </button>
        </div>
      </div>

      <div style={{ height: "30px" }} />
    </div>
  );
}
