export default function Footer() {
  return (
    <footer
      className="w-full shrink-0 h-9 flex items-center px-4 gap-1"
      style={{
        background: "#1a2332",
        borderTop: "1px solid #0d1520",
      }}
    >
      {/* Left: utility links */}
      <div className="flex items-center gap-0.5 flex-1">
        {[
          { label: "Documentation", href: "https://docs.aws.amazon.com" },
          { label: "Feedback",      href: "mailto:feedback@opscentre.dev" },
          { label: "Support",       href: "#" },
        ].map(({ label, href }, i, arr) => (
          <span key={label} className="flex items-center">
            <a
              href={href}
              className="text-[11px] px-2 transition-colors duration-150 hover:text-white/80 whitespace-nowrap"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              {label}
            </a>
            {i < arr.length - 1 && (
              <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>|</span>
            )}
          </span>
        ))}
      </div>

      {/* Right: copyright + legal links */}
      <div className="flex items-center gap-0.5 shrink-0">
        <span
          className="text-[11px] pr-3 whitespace-nowrap"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          © {new Date().getFullYear()}, Opscentre, Inc. or its affiliates.
        </span>
        {[
          { label: "Privacy",            href: "#" },
          { label: "Terms",              href: "#" },
          { label: "Cookie preferences", href: "#" },
        ].map(({ label, href }, i, arr) => (
          <span key={label} className="flex items-center">
            <a
              href={href}
              className="text-[11px] px-2 transition-colors duration-150 hover:text-white/80 whitespace-nowrap"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              {label}
            </a>
            {i < arr.length - 1 && (
              <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>|</span>
            )}
          </span>
        ))}
      </div>
    </footer>
  );
}
