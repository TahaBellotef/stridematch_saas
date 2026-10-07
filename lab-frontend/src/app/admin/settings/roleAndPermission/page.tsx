"use client";

import React from "react";
import { Bell, CheckSquare, Info, Lock, Sneaker, User } from "@phosphor-icons/react";

type TeamRow = {
	id: number;
	name: string;
	project: string;
	totalTask: string;
	progress: number;
	hours: string;
	progressColor: string;
	avatarColor: string;
};

const teamRows: TeamRow[] = [
	{ id: 1, name: "Alex Buckmaster", project: "React Project", totalTask: "122/240", progress: 80, hours: "123 Hours", progressColor: "#61E7A1", avatarColor: "#B38A62" },
	{ id: 2, name: "Chris Glasser", project: "Vue Project", totalTask: "98/150", progress: 65, hours: "45 Hours", progressColor: "#F4A81E", avatarColor: "#DDA67B" },
	{ id: 3, name: "Stephanie Nicol", project: "Angular Project", totalTask: "75/200", progress: 38, hours: "80 Hours", progressColor: "#E0525A", avatarColor: "#9297A0" },
	{ id: 4, name: "Iva Ryan", project: "Svelte Project", totalTask: "90/120", progress: 75, hours: "30 Hours", progressColor: "#61E7A1", avatarColor: "#577EC7" },
	{ id: 5, name: "Mary Freund", project: "Flutter Project", totalTask: "110/180", progress: 61, hours: "60 Hours", progressColor: "#F4A81E", avatarColor: "#8AA8B8" },
	{ id: 6, name: "Paula Mora", project: "Django Project", totalTask: "60/100", progress: 60, hours: "50 Hours", progressColor: "#61E7A1", avatarColor: "#C06A53" },
	{ id: 7, name: "Katie Sims", project: "Ruby on Rails Project", totalTask: "85/150", progress: 57, hours: "70 Hours", progressColor: "#F4A81E", avatarColor: "#B5A18D" },
	{ id: 8, name: "Frances Swann", project: "Laravel Project", totalTask: "50/80", progress: 62, hours: "40 Hours", progressColor: "#61E7A1", avatarColor: "#A27A74" },
	{ id: 9, name: "Patricia Sanders", project: "Node.js Project", totalTask: "110/200", progress: 20, hours: "85 Hours", progressColor: "#E0525A", avatarColor: "#6EA59A" },
	{ id: 10, name: "Kimberly Mastrangelo", project: "ASP.NET Project", totalTask: "130/250", progress: 87, hours: "100 Hours", progressColor: "#61E7A1", avatarColor: "#CFC8B8" },
];

function TopPill({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
	return (
		<button
			type="button"
			className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors"
			style={{
				background: active ? "linear-gradient(180deg, #4B4670 0%, #3B365A 100%)" : "transparent",
				border: active ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid transparent",
				color: active ? "#FFFFFF" : "#D1CEE8",
			}}
		>
			{icon}
			<span>{label}</span>
		</button>
	);
}

export default function RoleAndPermissionPage() {
	return (
		<div className="admin-page p-4 sm:p-6">
			<div className="mx-auto max-w-[1120px]">
				<div className="grid grid-cols-1 gap-4 xl:grid-cols-[450px_638px] xl:justify-center">
					<section
						className="rounded-2xl p-4 xl:w-[450px]"
						style={{
							background: "#363158",
							border: "1px solid rgba(0, 0, 0, 0.35)",
							boxShadow: "inset 0 0 0 1px #1E1C2B",
						}}
					>
						<div className="flex flex-col items-center">
							<div
								className="mb-5 flex h-28 w-24 items-center justify-center rounded-2xl"
								style={{
									background: "linear-gradient(180deg, #565083 0%, #464170 100%)",
									border: "1px solid rgba(255, 255, 255, 0.08)",
								}}
							>
								<User size={34} color="#EDEBFF" weight="light" />
							</div>
							<h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#F7F6FF]">Gustave Dessendre</h2>
							<span
								className="mt-1 rounded px-2 py-0.5 text-xs"
								style={{ background: "rgba(63, 187, 124, 0.16)", color: "#64E7A6", border: "1px solid rgba(100, 231, 166, 0.4)" }}
							>
								Admin
							</span>
						</div>

						<div className="mt-9 h-[0.5px] w-full" style={{ background: "#1F1F1F" }} />

						<div className="relative grid grid-cols-2">
							<div
								className="absolute left-1/2 top-1/2 h-8 w-[0.5px] -translate-x-1/2 -translate-y-1/2"
								style={{ background: "#1F1F1F" }}
							/>
							<div className="flex items-center gap-2.5 py-4 pl-4 pr-4">
								<div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "#221F3A" }}>
									<CheckSquare size={18} color="#F3F2FF" weight="regular" />
								</div>
								<div>
									<div className="text-[17px] font-medium leading-none text-white">1.23K</div>
									<div className="mt-1 text-xs font-normal text-[#B2ADCC]">Task done</div>
								</div>
							</div>
							<div className="flex items-center gap-2.5 py-4 pl-4">
								<div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "#221F3A" }}>
									<Sneaker size={20} color="#F3F2FF" weight="light" />
								</div>
								<div>
									<div className="text-[17px] font-medium leading-none text-white">142</div>
									<div className="mt-1 text-xs font-normal text-[#B2ADCC]">Shoe</div>
								</div>
							</div>
						</div>

						<div className="h-[0.5px] w-full" style={{ background: "#1F1F1F" }} />

						<div className="mt-6">
							<h3 className="mb-3 text-[22px] font-semibold text-white">Details</h3>
							<div className="space-y-2 text-[13px] leading-[1.35]">
								<div className="grid grid-cols-[95px_1fr] text-[#D7D3EA]"><span className="text-[#A9A4C5]">Username</span><span>@gustavedessendre</span></div>
								<div className="grid grid-cols-[95px_1fr] text-[#D7D3EA]"><span className="text-[#A9A4C5]">Billing Email</span><span>dessendregustave@mail.com</span></div>
								<div className="grid grid-cols-[95px_1fr] text-[#D7D3EA]"><span className="text-[#A9A4C5]">Status</span><span>8412994875912</span></div>
								<div className="grid grid-cols-[95px_1fr] text-[#D7D3EA]"><span className="text-[#A9A4C5]">Role</span><span>Each</span></div>
								<div className="grid grid-cols-[95px_1fr] text-[#D7D3EA]"><span className="text-[#A9A4C5]">Tax ID</span><span>ADZ-GRY-66</span></div>
								<div className="grid grid-cols-[95px_1fr] text-[#D7D3EA]"><span className="text-[#A9A4C5]">Contact</span><span>Grey / Black</span></div>
								<div className="grid grid-cols-[95px_1fr] text-[#D7D3EA]"><span className="text-[#A9A4C5]">Language</span><span>Road / Track</span></div>
								<div className="grid grid-cols-[95px_1fr] text-[#D7D3EA]"><span className="text-[#A9A4C5]">Country</span><span>Road / Track</span></div>
							</div>
						</div>

						<div className="mt-7 grid grid-cols-2 gap-3">
							<button
								type="button"
								className="rounded-full py-2.5 text-sm"
								style={{ background: "linear-gradient(180deg, #5A547F 0%, #46406B 100%)", color: "#EDEBFF", border: "1px solid rgba(255,255,255,0.15)" }}
							>
								Edit
							</button>
							<button
								type="button"
								className="rounded-full py-2.5 text-sm"
								style={{ background: "transparent", color: "#E05058", border: "1px solid #E05058" }}
							>
								Suspend
							</button>
						</div>
					</section>

					<section
						className="rounded-2xl p-3 xl:w-[638px]"
						style={{
							background: "#363158",
							border: "1px solid rgba(0, 0, 0, 0.35)",
							boxShadow: "inset 0 0 0 1px #1E1C2B",
						}}
					>
						<div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
							<div className="flex flex-wrap items-center gap-1">
								<TopPill active icon={<User size={12} />} label="Overview" />
								<TopPill icon={<Lock size={12} />} label="Security" />
								<TopPill icon={<Bell size={12} />} label="Notifications" />
								<TopPill icon={<Info size={12} />} label="Connection" />
							</div>
						</div>

						<div
							className="rounded-xl px-4 py-3"
							style={{
								background: "#302C4F",
								border: "1px solid rgba(0,0,0,0.32)",
							}}
						>
							<div
								className="grid grid-cols-[1.7fr_0.9fr_1fr_0.8fr] items-center rounded-lg px-3 py-2.5 text-[11px] text-[#DDD9EF]"
								style={{
									background: "rgba(255, 255, 255, 0.04)",
									border: "1px solid rgba(255,255,255,0.06)",
								}}
							>
								<div>Name</div>
								<div>Total Task</div>
								<div>Progress</div>
								<div>Hours</div>
							</div>

							<div className="mt-1">
								{teamRows.map((row, index) => (
									<div
										key={row.id}
										className="grid grid-cols-[1.7fr_0.9fr_1fr_0.8fr] items-center gap-2 px-2 py-2.5"
										style={{
											borderBottom: index === teamRows.length - 1 ? "none" : "1px solid #1F1F1F",
										}}
									>
										<div className="flex min-w-0 items-center gap-2.5">
											<div
												className="h-8 w-8 shrink-0 rounded-full"
												style={{
													background: `radial-gradient(circle at 30% 25%, #FFFFFF 0%, ${row.avatarColor} 62%)`,
													border: "1px solid rgba(0,0,0,0.28)",
												}}
											/>
											<div className="min-w-0">
												<div className="truncate text-[12px] text-white">{row.name}</div>
												<div className="truncate text-[11px] text-[#A8A3C4]">{row.project}</div>
											</div>
										</div>
												<div className="text-[12px] text-[#E7E4F6]">{row.totalTask}</div>
										<div>
													<div className="text-[12px]" style={{ color: row.progressColor }}>
												{row.progress}%
											</div>
											<div
												className="mt-1 h-2 w-[74px] overflow-hidden rounded-full"
												style={{ background: "#2B2744", border: "1px solid rgba(255,255,255,0.12)" }}
											>
												<div
													className="h-full rounded-full"
													style={{ width: `${row.progress}%`, background: row.progressColor }}
												/>
											</div>
										</div>
										<div className="text-[12px] text-[#E7E4F6]">{row.hours}</div>
									</div>
								))}
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
