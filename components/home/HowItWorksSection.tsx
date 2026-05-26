'use client';

import { motion } from 'framer-motion';
import ExplainerVideo from '@/components/ExplainerVideo';

interface Step {
  title: string;
  body: string;
  icon: any;
  learnMore?: boolean;
}

interface Props {
  steps: Step[];
  explainerVideo?: {
    title?: string | null;
    description?: string | null;
    youtube_url?: string | null;
  } | null;
}

export default function HowItWorksSection({
  steps,
  explainerVideo,
}: Props) {
  return (
    <section id="product" className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-black sm:text-4xl">
          How SpinBite Works
        </h2>

        <ExplainerVideo
          title={explainerVideo?.title}
          description={explainerVideo?.description}
          youtubeUrl={explainerVideo?.youtube_url}
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <motion.div
              key={step.title}
              whileHover={{ y: -6 }}
              className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-orange-100"
            >
              <step.icon className="h-8 w-8 text-[#FF6B00]" />

              <h3 className="mt-4 text-xl font-black">
                {step.title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-stone-600">
                {step.body}
              </p>

              {step.learnMore && (
                <a
                  href="/faq"
                  className="mt-4 inline-flex rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-[#FF6B00]"
                >
                  Learn more
                </a>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
