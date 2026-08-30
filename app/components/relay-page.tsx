import { chatGPTSignInPath, getChatGPTUser } from '@/app/chatgpt-auth';
import { RelayApp } from './relay-app';
import type { AppView } from './types';

export async function RelayPage({ view, campaignId }: { view: AppView; campaignId?: string | null }) {
  const user = await getChatGPTUser();
  if (!user) return <SignInScreen />;
  return <RelayApp view={view} campaignId={campaignId} />;
}

function SignInScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f5] p-5">
      <section className="w-full max-w-lg rounded-[26px] border border-[#deded8] bg-white p-8 text-center shadow-[0_18px_60px_rgba(30,40,34,0.07)] sm:p-12">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#263d32] text-lg font-bold text-white">R</span>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">Welcome to Relay</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#707069]">Claim hackathon outreach batches, connect your own Gmail accounts, and send without touching a spreadsheet.</p>
        <a href={chatGPTSignInPath('/')} className="mt-7 inline-flex h-11 items-center rounded-xl bg-[#263d32] px-5 text-sm font-semibold text-white">Sign in to Relay</a>
        <p className="mt-4 text-xs text-[#92928b]">Only approved team members should access campaign data.</p>
      </section>
    </main>
  );
}
