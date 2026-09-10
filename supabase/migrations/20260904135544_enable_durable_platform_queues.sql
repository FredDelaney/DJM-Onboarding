create extension if not exists pgmq;

select pgmq.create('platform_jobs');

select pgmq.create('platform_events');
