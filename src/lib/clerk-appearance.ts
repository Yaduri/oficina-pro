// Visual dos componentes do Clerk (login, cadastro, perfil) no padrão do design B.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#18181b",
    colorPrimaryForeground: "#ffffff",
    colorForeground: "#18181b",
    colorMutedForeground: "#71717a",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#18181b",
    colorBorder: "#d4d4d8",
    colorDanger: "#b91c1c",
    colorSuccess: "#15803d",
    colorRing: "#18181b",
    fontFamily: "var(--font-plex), system-ui, sans-serif",
    fontSize: "14px",
    borderRadius: "6px",
  },
  elements: {
    cardBox: {
      boxShadow: "0 8px 24px -12px rgba(24,24,27,.12)",
      border: "1px solid #e4e4e7",
      borderRadius: "12px",
    },
    formButtonPrimary: { height: "44px", fontSize: "15px", fontWeight: 500 },
    formFieldInput: { height: "44px", fontSize: "15px" },
    socialButtonsBlockButton: { height: "44px" },
  },
};
