function timeGreeting(hour: number) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

type Props = {
  ownerName?: string | null;
  restaurantName: string;
};

export function DashboardGreeting({ ownerName, restaurantName }: Props) {
  const greeting = timeGreeting(new Date().getHours());
  return (
    <div>
      <p className="text-sm font-semibold text-stone-500">
        {greeting}
        {ownerName ? `, ${ownerName}` : ''}
      </p>
      <h1 className="text-2xl font-black text-[#1F1F1F]">{restaurantName}</h1>
    </div>
  );
}
