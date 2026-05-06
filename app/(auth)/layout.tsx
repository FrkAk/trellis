/**
 * Auth route group layout — viewport-fill pass-through.
 *
 * Each child page (sign-in, sign-up, consent) owns its own framing. Sign-in
 * and sign-up render the two-column AuthShell; consent wraps itself in a
 * centered container. The layout itself adds nothing beyond a min-height
 * floor so the auth surface always fills the viewport without scroll bleed.
 *
 * @param props - Layout props with children.
 * @returns Pass-through container with min viewport height.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="min-h-[100dvh]">{children}</div>;
}
