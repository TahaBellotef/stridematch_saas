"use client";

import React, { useMemo, useState } from "react";

type ModuleItem = {
	id: string;
	label: string;
};

type AddOnItem = {
	id: string;
	title: string;
	description: string;
};

const moduleItems: ModuleItem[] = [
	{ id: "bill-of-supply", label: "Bill Of Supply" },
	{ id: "estimates", label: "Estimates" },
	{ id: "sales-orders", label: "Sales Orders" },
	{ id: "delivery-challans", label: "Delivery Challans" },
	{ id: "purchase-orders", label: "Purchase Orders" },
	{ id: "retainer-invoices", label: "Retainer Invoices" },
	{ id: "recurring-invoice", label: "Recurring Invoice" },
	{ id: "recurring-expense", label: "Recurring Expense" },
	{ id: "recurring-bills", label: "Recurring Bills" },
	{ id: "recurring-journals", label: "Recurring Journals" },
	{ id: "credit-note", label: "Credit Note" },
	{ id: "payment-links", label: "Payment Links" },
	{ id: "tasks", label: "Tasks" },
];

const addOnItems: AddOnItem[] = [
	{
		id: "item-groups",
		title: "Item Groups",
		description: "Pretend not to be evil meow to be let out intently stare at the same.",
	},
	{
		id: "composite-items",
		title: "Composite Items",
		description: "Pretend not to be evil meow to be let out intently stare at the same.",
	},
	{
		id: "packages",
		title: "Packages",
		description: "Pretend not to be evil meow to be let out intently stare at the same.",
	},
	{
		id: "picklists",
		title: "Picklists",
		description: "Pretend not to be evil meow to be let out intently stare at the same.",
	},
	{
		id: "shipments",
		title: "Shipments",
		description: "Pretend not to be evil meow to be let out intently stare at the same.",
	},
	{
		id: "purchase-receive",
		title: "Purchase Receive",
		description: "Pretend not to be evil meow to be let out intently stare at the same.",
	},
	{
		id: "sales-returns",
		title: "Sales Returns",
		description: "Pretend not to be evil meow to be let out intently stare at the same.",
	},
];

function Toggle({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
	return (
		<button
			type="button"
			aria-pressed={checked}
			onClick={onToggle}
			className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
			style={{
				background: checked ? "#64F7AA" : "#2E2A47",
				border: "1px solid rgba(255, 255, 255, 0.08)",
			}}
		>
			<span
				className="h-4 w-4 rounded-full transition-transform"
				style={{
					background: checked ? "#171527" : "#7E7B92",
					transform: checked ? "translateX(23px)" : "translateX(3px)",
				}}
			/>
		</button>
	);
}

export default function PreferencesPage() {
	const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>(() =>
		Object.fromEntries(moduleItems.map((item) => [item.id, false]))
	);

	const [enabledAddOns, setEnabledAddOns] = useState<Record<string, boolean>>(() => ({
		"item-groups": false,
		"composite-items": true,
		packages: false,
		picklists: true,
		shipments: false,
		"purchase-receive": false,
		"sales-returns": false,
	}));

	const moduleRows = useMemo(() => {
		const rows: ModuleItem[][] = [];
		for (let i = 0; i < moduleItems.length; i += 2) {
			rows.push(moduleItems.slice(i, i + 2));
		}
		return rows;
	}, []);

	return (
		<div className="admin-page p-4 sm:p-6">
			<div className="mx-auto max-w-6xl">
				<div
					className="rounded-2xl p-4 sm:p-5"
					style={{
						background: "var(--sm-fill)",
						border: "1px solid rgba(0, 0, 0, 0.28)",
						boxShadow:
							"inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 8px 24px rgba(8, 7, 20, 0.45)",
					}}
				>
					<div className="space-y-4">
						<div className="mb-4 flex items-start justify-between gap-2">
							<div>
								<h2 className="text-xl font-semibold text-white">Preferences</h2>
								<p className="mt-1 text-xs text-[#9E9AB6]">
									Pretend not to be evil meow to be let out intently stare at the same
								</p>
							</div>
						</div>

						<div
							className="rounded-xl p-4 sm:p-5"
							style={{
								background: "#332E52",
								border: "1px solid rgba(0, 0, 0, 0.28)",
							}}
						>
							<p className="mb-4 text-sm text-[#E4E2F4]">Select the modules you would like to enable.</p>

							<div className="space-y-2.5">
								{moduleRows.map((row, rowIndex) => (
									<div key={rowIndex} className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3">
										{row.map((item) => {
											const checked = selectedModules[item.id];
											return (
												<label
													key={item.id}
													className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-[#DFDDEF]"
													style={{
														background: "#28243D",
													}}
												>
													<input
														type="checkbox"
														checked={checked}
														onChange={() =>
															setSelectedModules((prev) => ({
																...prev,
																[item.id]: !prev[item.id],
															}))
														}
														className="sr-only"
													/>
													<span
														aria-hidden="true"
														className="flex h-4 w-4 items-center justify-center rounded-sm"
														style={{
															background: "#28243D",
															border: "1px solid rgba(0, 0, 0, 0.28)",
															boxShadow: "inset 0 0 0 0.5px #1E1C2B",
														}}
													>
														{checked ? <span className="text-[10px] leading-none text-[#E8E5F8]">✓</span> : null}
													</span>
													<span>{item.label}</span>
												</label>
											);
										})}
									</div>
								))}
							</div>
						</div>

						<div
							className="mt-4 rounded-xl"
							style={{
								border: "1px solid rgba(0, 0, 0, 0.28)",
								background: "var(--sm-fill)",
							}}
						>
							<div className="flex items-center justify-between px-4 py-3">
								<h3 className="text-lg font-medium text-[#F1F0FA]">Inventory Add-on</h3>
							</div>

							<div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
								{addOnItems.map((item) => (
									<div
										key={item.id}
										className="rounded-xl p-4"
										style={{
											background: "#312D4B",
											border: "1px solid rgba(0, 0, 0, 0.28)",
											boxShadow: "inset 0 0 0 0.5px #1E1C2B",
										}}
									>
										<div className="mb-2 flex items-center justify-between gap-3">
											<h4 className="text-lg text-white">{item.title}</h4>
											<Toggle
												checked={Boolean(enabledAddOns[item.id])}
												onToggle={() =>
													setEnabledAddOns((prev) => ({
														...prev,
														[item.id]: !prev[item.id],
													}))
												}
											/>
										</div>
										<p className="max-w-[33ch] text-xs leading-5 text-[#A9A6BF]">{item.description}</p>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
