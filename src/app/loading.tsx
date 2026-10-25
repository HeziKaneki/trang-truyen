export default function Loading() {
  return (
    <div className="container-page animate-pulse py-12">
      <div className="mb-8 h-10 w-64 rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}>
            <div className="aspect-[2/3] rounded-xl bg-muted" />
            <div className="mt-4 h-5 rounded bg-muted" />
            <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
