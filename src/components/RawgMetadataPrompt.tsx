import { ExternalLink, Gamepad2, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { metadataApi } from "@/lib/api";
import type { Game, RawgGame } from "@/types";

type GameLite = Pick<Game, "id" | "name">;

interface RawgMetadataPromptProps {
	game: GameLite;
	remaining: number;
	onNext: () => void;
	onSkipAll: () => void;
	onAfterApply?: () => void | Promise<void>;
}

export function RawgMetadataPrompt({
	game,
	remaining,
	onNext,
	onSkipAll,
	onAfterApply,
}: RawgMetadataPromptProps) {
	const { notify } = useToast();

	const [query, setQuery] = useState(game.name);
	const [results, setResults] = useState<RawgGame[]>([]);
	const [searching, setSearching] = useState(false);
	const [applyingId, setApplyingId] = useState<number | null>(null);
	const [renameFromMetadata, setRenameFromMetadata] = useState(false);
	const [rawgKeyStatus, setRawgKeyStatus] = useState<
		"unknown" | "present" | "missing"
	>("unknown");

	const searchSeq = useRef(0);
	const applySeq = useRef(0);

	const hasApiKey = useMemo(() => rawgKeyStatus === "present", [rawgKeyStatus]);

	useEffect(() => {
		setQuery(game.name);
		setResults([]);
		setSearching(false);
		setApplyingId(null);

		let cancelled = false;
		setRawgKeyStatus("unknown");
		metadataApi
			.getApiKey()
			.then((key) => {
				if (cancelled) return;
				setRawgKeyStatus(key?.trim() ? "present" : "missing");
			})
			.catch(() => {
				if (cancelled) return;
				setRawgKeyStatus("missing");
			});

		return () => {
			cancelled = true;
		};
	}, [game.id, game.name]);

	const searchMetadata = async (forcedQuery?: string) => {
		const q = (forcedQuery ?? query).trim();
		if (!q) return;

		const seq = ++searchSeq.current;
		setSearching(true);
		try {
			const found = await metadataApi.search(q);
			if (searchSeq.current !== seq) return;
			setResults(found);
			if (found.length === 0) {
				notify({
					tone: "info",
					title:
						"\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e",
					description:
						"\u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0443\u0442\u043e\u0447\u043d\u0438\u0442\u044c \u0437\u0430\u043f\u0440\u043e\u0441.",
					durationMs: 2600,
				});
			}
		} catch (e) {
			if (searchSeq.current !== seq) return;
			console.error("RAWG search failed:", e);
			notify({
				tone: "error",
				title:
					"\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0439\u0442\u0438 \u043c\u0435\u0442\u0430\u0434\u0430\u043d\u043d\u044b\u0435",
				description:
					"\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 RAWG API \u043a\u043b\u044e\u0447 \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445.",
			});
		} finally {
			if (searchSeq.current === seq) {
				setSearching(false);
			}
		}
	};

	useEffect(() => {
		if (!hasApiKey) return;
		if (!query.trim()) return;

		// Auto-search when the prompt opens for a newly added game.
		const timeout = window.setTimeout(() => {
			void searchMetadata(query);
		}, 80);

		return () => {
			window.clearTimeout(timeout);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [game.id, hasApiKey]);

	const applyMetadata = async (rawgGame: RawgGame) => {
		const seq = ++applySeq.current;
		setApplyingId(rawgGame.id);
		try {
			await metadataApi.apply(game.id, rawgGame.id, renameFromMetadata);
			if (applySeq.current !== seq) return;
			await onAfterApply?.();
			notify({
				tone: "success",
				title:
					"\u041c\u0435\u0442\u0430\u0434\u0430\u043d\u043d\u044b\u0435 \u043f\u0440\u0438\u043c\u0435\u043d\u0435\u043d\u044b",
				description: rawgGame.name,
				durationMs: 2400,
			});
			onNext();
		} catch (e) {
			if (applySeq.current !== seq) return;
			console.error("Failed to apply RAWG metadata:", e);
			notify({
				tone: "error",
				title:
					"\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c \u043c\u0435\u0442\u0430\u0434\u0430\u043d\u043d\u044b\u0435",
			});
		} finally {
			if (applySeq.current === seq) {
				setApplyingId(null);
			}
		}
	};

	return (
		<div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
			<div className="relative bg-card rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.55)] overflow-hidden">
				{/* Ambient gradient */}
				<div className="absolute inset-0 pointer-events-none">
					<div
						className="absolute -top-24 -right-24 h-56 w-56 rounded-full blur-3xl opacity-60"
						style={{
							background:
								"radial-gradient(circle, rgba(56,189,248,0.35), rgba(56,189,248,0))",
						}}
					/>
					<div
						className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full blur-3xl opacity-50"
						style={{
							background:
								"radial-gradient(circle, rgba(244,63,94,0.25), rgba(244,63,94,0))",
						}}
					/>
				</div>

				<div className="relative p-4 border-b border-border/70">
					<div className="flex items-start gap-3">
						<div className="flex-1 min-w-0">
							<div className="text-sm font-semibold">
								{
									"\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043c\u0435\u0442\u0430\u0434\u0430\u043d\u043d\u044b\u0435 (RAWG)"
								}
							</div>
							<div className="text-xs text-muted-foreground mt-0.5 truncate">
								{game.name}
								{remaining > 1
									? ` \u00b7 \u041e\u0441\u0442\u0430\u043b\u043e\u0441\u044c: ${remaining}`
									: ""}
							</div>
						</div>
						<button
							onClick={onSkipAll}
							className="text-muted-foreground hover:text-foreground transition-colors"
							aria-label="Close"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="relative p-4 flex-1 overflow-hidden flex flex-col">
					{rawgKeyStatus === "missing" && (
						<div className="mb-4 rounded-xl border border-border/70 bg-secondary/20 p-3">
							<div className="text-sm font-semibold">
								{
									"\u041d\u0443\u0436\u0435\u043d RAWG API \u043a\u043b\u044e\u0447"
								}
							</div>
							<div className="text-xs text-muted-foreground mt-1 leading-relaxed">
								{
									"\u0414\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u043a\u043b\u044e\u0447 \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445, \u0447\u0442\u043e\u0431\u044b \u0438\u0441\u043a\u0430\u0442\u044c \u043c\u0435\u0442\u0430\u0434\u0430\u043d\u043d\u044b\u0435."
								}
							</div>
							<div className="mt-3 flex items-center justify-end gap-2">
								<Button variant="ghost" onClick={onNext}>
									{"\u041d\u0435 \u0441\u0435\u0439\u0447\u0430\u0441"}
								</Button>
								<Link to="/settings">
									<Button>
										{
											"\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438"
										}
									</Button>
								</Link>
							</div>
						</div>
					)}

					<div className="flex gap-2 mb-4">
						<Input
							placeholder={
								"\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0438\u0433\u0440\u044b..."
							}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && void searchMetadata()}
							disabled={!hasApiKey}
							autoFocus
						/>
						<Button
							onClick={() => void searchMetadata()}
							disabled={!hasApiKey || searching}
							title={
								hasApiKey
									? "\u041d\u0430\u0439\u0442\u0438"
									: "\u041d\u0443\u0436\u0435\u043d RAWG API \u043a\u043b\u044e\u0447"
							}
						>
							{searching ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Search className="w-4 h-4" />
							)}
						</Button>
					</div>

					<div className="flex items-center justify-between gap-3 text-sm text-muted-foreground mb-3">
						<span id="rawg-rename-toggle">
							{
								"\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0438\u0437 RAWG"
							}
						</span>
						<Switch
							checked={renameFromMetadata}
							onCheckedChange={setRenameFromMetadata}
							aria-labelledby="rawg-rename-toggle"
						/>
					</div>

					<ScrollArea className="flex-1">
						{results.length > 0 ? (
							<div className="space-y-2">
								{results.map((result) => (
									<button
										key={result.id}
										className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/70 cursor-pointer border border-transparent hover:border-border transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
										onClick={() => void applyMetadata(result)}
										disabled={applyingId !== null}
									>
										{result.background_image ? (
											<img
												src={result.background_image}
												alt={result.name}
												className="w-14 h-14 object-cover rounded-lg border border-border/60"
												loading="lazy"
											/>
										) : (
											<div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center border border-border/60">
												<Gamepad2 className="w-6 h-6 text-muted-foreground" />
											</div>
										)}

										<div className="flex-1 min-w-0">
											<div className="font-medium truncate">{result.name}</div>
											<div className="text-xs text-muted-foreground mt-0.5">
												{result.released?.slice(0, 4) ?? "\u2014"}
												{result.metacritic != null
													? ` \u00b7 MC ${result.metacritic}`
													: ""}
											</div>
										</div>

										{applyingId === result.id ? (
											<Loader2 className="w-4 h-4 animate-spin text-primary" />
										) : (
											<ExternalLink className="w-4 h-4 text-muted-foreground" />
										)}
									</button>
								))}
							</div>
						) : (
							<div className="text-center py-10 text-muted-foreground text-sm">
								{hasApiKey
									? "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0438 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 \u043f\u043e\u0438\u0441\u043a"
									: "\u0414\u043e\u0431\u0430\u0432\u044c\u0442\u0435 RAWG API \u043a\u043b\u044e\u0447 \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445"}
							</div>
						)}
					</ScrollArea>
				</div>

				<div className="relative p-4 border-t border-border/70 flex items-center justify-between gap-2">
					<Button variant="ghost" onClick={onSkipAll}>
						{
							"\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0432\u0441\u0435"
						}
					</Button>
					<div className="flex items-center gap-2">
						<Button variant="ghost" onClick={onNext}>
							{"\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
