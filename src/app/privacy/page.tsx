import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <Link
          href="/dashboard"
          className="text-sm text-blue-600 hover:text-blue-800 mb-4 inline-block"
        >
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Privacy Policy</h1>

        <div className="space-y-5 text-sm text-gray-700">
          <p>
            Board Game Night is a private scheduling tool used by a small,
            invite-only group of households to coordinate game nights. This
            page explains what information we collect and how it&apos;s used.
          </p>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">Information we collect</h2>
            <p>
              For each household: a display name, an optional phone number,
              and the dates you mark yourself as available.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">How we use it</h2>
            <p>
              Your availability is shown to other households in the group so
              everyone can find a night that works. If you provide a phone
              number, we may text you about scheduling updates, such as when
              a new best night is found or a reminder to set your
              availability.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">Sharing</h2>
            <p>
              We don&apos;t sell or share your information with third parties,
              other than our SMS provider (Twilio), which we use solely to
              deliver text messages to you.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">Opting out</h2>
            <p>
              Reply STOP to any text message to stop receiving texts, or ask
              the group organizer to remove your phone number at any time.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">Data retention</h2>
            <p>
              Your information is kept only as long as your household is part
              of the group, and is deleted when the organizer removes you.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 mb-1">Contact</h2>
            <p>Questions about this policy? Reach out to the group organizer.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
