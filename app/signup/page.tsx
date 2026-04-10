import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">ship.veltro.ai</h1>
          <p className="mt-2 text-gray-600">Utwórz konto dla swojej firmy</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <SignupForm />
        </div>
        <p className="text-center mt-4 text-sm text-gray-600">
          Masz już konto?{" "}
          <a href="/login" className="text-blue-600 hover:underline font-medium">
            Zaloguj się
          </a>
        </p>
      </div>
    </div>
  );
}
