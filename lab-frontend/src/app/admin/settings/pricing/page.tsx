"use client";

import React, { useState } from "react";
import { Barbell, Buildings, CheckCircle, Storefront } from "@phosphor-icons/react";

type Plan = {
	id: string;
	name: string;
	icon: React.ReactNode;
	oldPrice: string;
	price: string;
	commitment: string;
	cta: string;
	ctaVariant: "current" | "primary" | "secondary";
	subtitle: string;
	featuresLead: string;
	features: string[];
	popular?: boolean;
	accent?: string;
};

const plans: Plan[] = [
	{
		id: "essential",
		name: "Essential",
		icon: <Storefront size={18} weight="light" className="text-[#CFCBE6]" />,
		oldPrice: "349€/mois",
		price: "279€",
		commitment: "12-month commitment",
		cta: "You Current Plan",
		ctaVariant: "current",
		subtitle: "The essentials of running advice, ready to use. Includes gait analysis, foot scan and shoe recommendation.",
		featuresLead: "",
		features: [
			"Turnkey in-store experience",
			"Dashboard and basic analytics",
			"Limited scans included",
			"Standard support",
		],
	},
	{
		id: "growth",
		name: "Growth",
		icon: <Barbell size={18} weight="light" className="text-[#D8D3F3]" />,
		oldPrice: "749€/mois",
		price: "599€",
		commitment: "12-month commitment",
		cta: "Upgrade",
		ctaVariant: "primary",
		subtitle: "Turn advice into a growth lever.",
		featuresLead: "Everything in Essential, plus:",
		features: [
			"Multi-user dashboard (5 Users Maximum)",
			"Advanced analytics and reporting",
			"High volume of scans to support your business",
			"Team training",
			"Standard support",
		],
		popular: true,
		accent: "#4A20EE",
	},
	{
		id: "enterprise",
		name: "Enterprise",
		icon: <Buildings size={18} weight="light" className="text-[#CFCBE6]" />,
		oldPrice: "1199€/mois",
		price: "959€",
		commitment: "12-month commitment",
		cta: "Upgrade",
		ctaVariant: "secondary",
		subtitle: "A solution built for large-scale deployment in physical stores and/or online.",
		featuresLead: "Everything in Growth, plus:",
		features: [
			"Multi-user dashboard (Unlimited Users)",
			"Turnkey in-store experience",
			"Dashboard and basic analytics",
			"Limited scans included",
			"Advanced dashboard",
			"Unlimited scans",
			"Priority support",
			"Dedicated account manager",
		],
	},
];

const PLAN_DIVIDER = "1px solid #1F1F1F";

function Toggle({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
	return (
		<button
			type="button"
			aria-pressed={checked}
			onClick={onToggle}
			className="relative inline-flex h-6 w-10 items-center rounded-full"
			style={{
				background: checked ? "#64F7AA" : "#2E2A47",
				border: "1px solid rgba(255, 255, 255, 0.08)",
			}}
		>
			<span
				className="h-4 w-4 rounded-full transition-transform"
				style={{
					background: checked ? "#1B1930" : "#8A86A6",
					transform: checked ? "translateX(20px)" : "translateX(3px)",
				}}
			/>
		</button>
	);
}

function CtaButton({ label, variant }: { label: string; variant: Plan["ctaVariant"] }) {
	const styleByVariant = {
		current: {
			background: "linear-gradient(180deg, #423D64 0%, #353155 100%)",
			border: "1px solid rgba(255, 255, 255, 0.16)",
			color: "#D8D4EC",
		},
		primary: {
			background: "#6A47F4",
			border: "1px solid rgba(255, 255, 255, 0.2)",
			color: "#F6F5FF",
		},
		secondary: {
			background: "linear-gradient(180deg, #58537D 0%, #484469 100%)",
			border: "1px solid rgba(255, 255, 255, 0.16)",
			color: "#F0EDFF",
		},
	} as const;

	return (
		<button
			type="button"
			className="w-full rounded-full px-4 py-1.5 text-sm font-medium"
			style={styleByVariant[variant]}
		>
			{label}
		</button>
	);
}

function PlanCard({ plan }: { plan: Plan }) {
	return (
		<article
			className={`relative h-full rounded-2xl p-2.5 ${plan.popular ? "lg:-mt-3 lg:pb-6" : "lg:mt-3"}`}
			style={{
				background: plan.popular ? "linear-gradient(180deg, #4A20EE 0%, #28243D 100%)" : "#302C4F",
				border: `1px solid ${plan.popular ? "#7754FF" : "rgba(0, 0, 0, 0.35)"}`,
				boxShadow: plan.popular
					? "inset 0 0 0 1px rgba(119,84,255,0.3), 0 12px 24px rgba(20, 8, 49, 0.25)"
					: "inset 0 0 0 1px #1E1C2B",
			}}
		>
			{plan.popular && (
				<div
					className="absolute left-0 right-0 top-0 h-7 rounded-t-2xl text-center text-[10px] font-semibold uppercase tracking-[0.16em]"
					style={{
						background: "transparent",
						color: "#C4B8FF",
						lineHeight: "28px",
					}}
				>
					Popular
				</div>
			)}

			<div
				className="flex h-[620px] flex-col rounded-xl p-4"
				style={{
					marginTop: plan.popular ? "22px" : "0px",
					background: "#353154",
					border: "1px solid rgba(255, 255, 255, 0.08)",
				}}
			>
				<div className="mb-3 flex justify-center">
					<div
						className="flex h-7 w-7 items-center justify-center rounded-full"
						style={{
							border: "1px solid rgba(255,255,255,0.18)",
							background: "rgba(32, 29, 53, 0.9)",
						}}
					>
						{plan.icon}
					</div>
				</div>

				<h3 className="text-center text-[26px] font-semibold text-[#F6F3FF]">{plan.name}</h3>

				<div className="mt-3 w-full" style={{ borderTop: PLAN_DIVIDER }} />

				<div className="mt-3 text-center">
					<div className="text-xs text-[#A84655] line-through">{plan.oldPrice}</div>
					<div className="mt-1 text-[34px] font-semibold leading-none text-white">
						{plan.price}
						<span className="ml-1 text-[14px] font-medium text-[#AFAAC9]">HT / Mois</span>
					</div>
					<p className="mt-1.5 text-xs text-[#A8A3C2]">{plan.commitment}</p>
				</div>

				<div className="mt-4">
					<CtaButton label={plan.cta} variant={plan.ctaVariant} />
				</div>

				<p className="mt-3 px-1 text-center text-xs leading-5 text-[#9C97B8]">{plan.subtitle}</p>

				<div className="mt-3 w-full" style={{ borderTop: PLAN_DIVIDER }} />

				<div className="mt-3 flex-1 overflow-hidden">
					{plan.featuresLead ? <p className="mb-2.5 text-xs text-[#B7B3CD]">{plan.featuresLead}</p> : null}
					<ul className="space-y-2">
						{plan.features.map((feature) => (
							<li key={feature} className="flex items-start gap-2 text-xs leading-5 text-[#BAB5D0]">
								<CheckCircle
									size={14}
									weight="fill"
									color={plan.popular ? "#7754FF" : "#8D89A5"}
									className="mt-0.5 shrink-0"
								/>
								<span className="break-words">{feature}</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</article>
	);
}

export default function PricingPage() {
	const [annual, setAnnual] = useState(true);

	return (
		<div className="admin-page p-4 sm:p-6">
			<div className="mx-auto max-w-[1320px]">
				<div className="p-0 sm:p-1">
					<div className="mb-8 text-center">
						<h1 className="text-[16px] font-semibold leading-tight text-[#F8F6FF]">A plan for every store</h1>
						<p className="mt-1.5 text-xs text-[#A9A4C5]">
							From local shops to national chains, StrideMatch adapts to your needs.
						</p>
						<div className="mt-3 inline-flex items-center gap-2.5">
							<span className="text-sm font-medium text-[#60E497]">Save 20% with annually</span>
							<Toggle checked={annual} onToggle={() => setAnnual((prev) => !prev)} />
						</div>
					</div>

					<div className="mx-auto grid max-w-[1040px] grid-cols-1 items-stretch gap-3 lg:grid-cols-3">
						{plans.map((plan) => (
							<PlanCard key={plan.id} plan={plan} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
