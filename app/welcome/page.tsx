import { logoutAction } from "@/app/actions/auth";

export default function WelcomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Brak organizacji</h1>
        <p className="text-gray-500 mb-6">
          Twoje konto nie jest przypisane do żadnej organizacji.
          Zarejestruj nowe konto lub skontaktuj się z administratorem.
        </p>
        <form action={logoutAction}>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Wyloguj i zacznij od nowa
          </button>
        </form>
      </div>
    </div>
  );
}
