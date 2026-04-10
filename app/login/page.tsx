import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">ship.veltro.ai</h1>
          <p className="mt-2 text-gray-600">Zaloguj się do swojego konta</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <LoginForm />
        </div>
        <p className="text-center mt-4 text-sm text-gray-600">
          Nie masz konta?{" "}
          <a href="/signup" className="text-blue-600 hover:underline font-medium">
            Zarejestruj się
          </a>
        </p>
      </div>
    </div>
  );
}
