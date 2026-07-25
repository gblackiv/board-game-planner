import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <Link
          href="/dashboard"
          className="text-sm text-blue-600 hover:text-blue-800 mb-4 inline-block"
        >
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Terms &amp; Conditions
        </h1>

        <div className="space-y-5 text-sm text-gray-700">
          <p>
            These terms cover the SMS messaging program for Board Game Night,
            a private scheduling tool used by a small, invite-only group of
            households.
          </p>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">
              What the texts are for
            </h2>
            <p>
              If you provide a phone number, we may send you scheduling
              updates, such as when a new best night is found or a reminder
              to set your availability.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">
              Consent to receive texts
            </h2>
            <p>
              By providing your phone number to the group, you consent to
              receive text messages related to game night scheduling.
              Message frequency varies. Message and data rates may apply.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">
              Opting out
            </h2>
            <p>
              Reply STOP to any text message to stop receiving texts, or
              reply HELP for help. You can also ask the group organizer to
              remove your phone number at any time.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">Carriers</h2>
            <p>
              Carriers are not liable for delayed or undelivered messages.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">
              Privacy
            </h2>
            <p>
              See our{" "}
              <Link href="/privacy" className="text-blue-600 hover:text-blue-800">
                Privacy Policy
              </Link>{" "}
              for details on how we handle your information.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">Contact</h2>
            <p>Questions about these terms? Reach out to the group organizer.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
