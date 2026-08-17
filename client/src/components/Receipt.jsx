import LogoCanvas from "./LogoCanvas.jsx";

const W = 42;

const lineClass = (line) => {
  const base = "whitespace-pre font-mono leading-tight";
  const size = line.bold ? "text-[13px] font-bold" : "text-[13px]";
  const align = { center: "text-center", right: "text-right" }[line.align] || "text-left";
  return `${base} ${size} ${align}`;
};

export default function Receipt({ receipt }) {
  const { logo, lines } = receipt || {};
  if (!Array.isArray(lines)) return null;
  return (
    <div
      className="mx-auto bg-white px-4 py-4 shadow-sm border border-slate-200"
      style={{ width: "360px", minHeight: "180px" }}
    >
      {logo && <LogoCanvas logo={logo} width="280px" />}
      <div className="mt-2 text-slate-700">
        {lines.map((line, i) => {
          if (line.type === "logo" || line.type === "blank") return <div key={i} className="h-2" />;
          if (line.type === "divider")
            return (
              <div key={i} className="font-mono text-[13px] text-slate-500">
                {"-".repeat(W)}
              </div>
            );
          return (
            <div key={i} className={lineClass(line)}>
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}