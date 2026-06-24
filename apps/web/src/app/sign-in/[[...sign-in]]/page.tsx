import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-12">
      {/* Premium background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black" />
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-800/10 blur-[120px] size-96" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 rounded-full bg-zinc-900/20 blur-[150px] size-96" />

      {/* Auth Card wrapper */}
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Aegis AI
            </h1>
            <p className="text-sm text-zinc-400">
              Enter your credentials to access the admin dashboard
            </p>
          </div>

          <SignIn
            path="/sign-in"
            routing="path"
            signUpUrl="/sign-up"
            appearance={{
              theme: undefined, // Custom branding is managed in the Clerk Dashboard
              elements: {
                rootBox: "w-full",
                cardBox: "shadow-none border-none bg-transparent p-0",
                card: "bg-transparent shadow-none",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsIconButton: "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700",
                formButtonPrimary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
                footerActionText: "text-zinc-400",
                footerActionLink: "text-zinc-200 hover:text-zinc-100",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
